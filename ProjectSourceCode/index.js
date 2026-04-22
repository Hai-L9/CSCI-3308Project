require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const path = require('path');
const db = require('./src/resources/db.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');

const app = express();
const port = process.env.PORT || 3000;
const serviceStatusHistoryKey = new Date().toISOString();

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST || 'db',
  database: process.env.POSTGRES_DB,
  port: process.env.POSTGRES_PORT || 5432,
});

async function checkDatabaseStatus() {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { status: 'ok', responseTimeMs: Date.now() - start, message: 'Connected' };
  } catch (err) {
    return { status: 'error', responseTimeMs: Date.now() - start, message: err.message };
  }
}

async function checkGoogleMapsStatus() {
  const start = Date.now();
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return { status: 'missing', responseTimeMs: 0, message: 'GOOGLE_MAPS_API_KEY is not configured' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=__serviceStatusCheck`;
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    const knownErrors = ['ApiNotActivatedMapError','BillingNotEnabledMapError','DeletedApiProjectMapError','ExpiredKeyMapError','InvalidKeyMapError','RefererNotAllowedMapError','RequestDeniedMapError'];
    const mapsError = knownErrors.find((errorCode) => body.includes(errorCode));
    return {
      status: response.ok && !mapsError ? 'ok' : 'error',
      responseTimeMs: Date.now() - start,
      message: mapsError ? mapsError : response.ok ? 'Reachable' : `Google Maps returned HTTP ${response.status}`,
    };
  } catch (err) {
    return { status: 'error', responseTimeMs: Date.now() - start, message: err.name === 'AbortError' ? 'Google Maps status check timed out' : err.message };
  } finally {
    clearTimeout(timeout);
  }
}

app.use(express.json());

// Static files
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use('/pages', express.static(path.join(__dirname, 'pages')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));

// Session persistence
app.use(session({
  store: new pgSession({
    conObject: {
      host: process.env.POSTGRES_HOST || 'db',
      port: process.env.POSTGRES_PORT || 5432,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
    },
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 86400,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

// Auth — must be imported before any route that uses authenticateToken or requireRole
const auth = require('./routes/auth');
auth.init(pool);
app.use('/api/auth', auth.router);
const { authenticateToken, requireRole } = auth;

const worksites = require('./routes/worksites');
worksites.init(pool, { authenticateToken, requireRole });
app.use('/api/worksites', worksites.router);

app.get('/api/config', (req, res) => {
  res.json({ googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

app.get('/api/service-status', async (req, res) => {
  const checkedAt = new Date().toISOString();
  const [database, googleMaps] = await Promise.all([checkDatabaseStatus(), checkGoogleMapsStatus()]);
  const healthy = database.status === 'ok' && googleMaps.status === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checkedAt,
    statusHistoryKey: serviceStatusHistoryKey,
    services: { database, googleMaps },
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ reply: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      systemInstruction: {
        role: "system",
        parts: [{ text: "You are a helpful AI assistant for Task Tracker, a work-order management application. Keep your answers concise and helpful." }]
      }
    });
    
    // Process history for Gemini format
    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
    const latestMessage = messages[messages.length - 1]?.content || '';

    if (!latestMessage) {
      return res.status(400).json({ error: 'No valid message found.' });
    }

    const chat = model.startChat({
      history: history
    });

    const result = await chat.sendMessage(latestMessage);
    const response = await result.response;
    const text = response.text();

    res.json({ reply: text });
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ reply: 'Sorry, I encountered an error while processing your request.' });
  }
});

// Welcome route
app.get('/welcome', (req, res) => {
  req.session.visits = (req.session.visits || 0) + 1;
  res.status(200).json({ status: 'success', message: 'Welcome!', visits: req.session.visits });
});

// Get all users 
app.get('/api/users', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const users = await db.any('SELECT id, username FROM users ORDER BY username');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get tasks — workers only see their assigned tasks, admins/managers see all
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    let tasks;
    if (req.user.role === 'worker') {
      tasks = await db.any(
        `SELECT t.*, w.name AS worksite_name, w.lat AS worksite_lat, w.lng AS worksite_lng
         FROM tasks t
         LEFT JOIN worksites w ON w.id = t.worksite_id
         WHERE t.created_by = $1
            OR t.id IN (SELECT task_id FROM task_assignments WHERE user_id = $1)`,
        [req.user.id]
      );
    } else {
      tasks = await db.any(
        `SELECT t.*, w.name AS worksite_name, w.lat AS worksite_lat, w.lng AS worksite_lng
         FROM tasks t
         LEFT JOIN worksites w ON w.id = t.worksite_id`
      );
    }
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Map tasks — managers and admins only
app.get('/api/tasks/map', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const tasks = await db.any(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.assignee, t.due_date,
              w.id AS worksite_id, w.name AS worksite_name, w.address AS worksite_address,
              w.lat AS worksite_lat, w.lng AS worksite_lng
       FROM tasks t
       INNER JOIN worksites w ON w.id = t.worksite_id
       WHERE w.lat IS NOT NULL AND w.lng IS NOT NULL
       ORDER BY t.due_date NULLS LAST, t.priority DESC, t.title`
    );
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task — managers and admins only
app.post('/api/tasks', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  const { title, description, status, due_date, priority, worksite_id, assignee } = req.body;
  if (!due_date) {
    return res.status(400).json({ error: 'Due date is required' });
  }

  try {
    let assigneeUser = null;
    if (assignee) {
      assigneeUser = await db.oneOrNone('SELECT id FROM users WHERE username = $1', [assignee]);
      if (!assigneeUser) {
        return res.status(400).json({ error: 'Assignee user does not exist' });
      }
    }

    const result = await db.one(
      `INSERT INTO tasks (title, description, status, due_date, created_by, priority, worksite_id, assignee)
       VALUES (\${title}, \${description}, \${status}, \${due_date}, \${created_by}, \${priority}, \${worksite_id}, \${assignee})
       RETURNING id, created_at`,
      {
        title,
        description,
        status: status || 'backlog',
        due_date,
        created_by: req.user.id,
        priority: priority || 'medium',
        worksite_id: worksite_id || null,
        assignee: assignee || null,
      }
    );

    const actualWorksiteId = worksite_id || null;
    if (actualWorksiteId) {
      await db.none('INSERT INTO task_worksite_history (task_id, worksite_id) VALUES ($1, $2)', [result.id, actualWorksiteId]);
    }

    if (assigneeUser) {
      await db.none(
        `INSERT INTO task_assignments (task_id, user_id, role)
         VALUES ($1, $2, 'assignee')
         ON CONFLICT (task_id, user_id) DO NOTHING`,
        [result.id, assigneeUser.id]
      );
    }

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
// - Managers/admins can edit all fields
// - Workers can only update status, and only on tasks assigned to them
app.patch('/api/tasks/:id', authenticateToken, async (req, res) => {
  const taskId = parseInt(req.params.id);
  try {
    if (req.user.role === 'worker') {
      // Verify the task is assigned to this worker
      const assigned = await db.oneOrNone(
        `SELECT t.id FROM tasks t
         WHERE t.id = $1
           AND (t.created_by = $2
                OR t.id IN (SELECT task_id FROM task_assignments WHERE user_id = $2))`,
        [taskId, req.user.id]
      );
      if (!assigned) return res.status(403).json({ error: 'Forbidden' });

      const validStatuses = ['backlog', 'in-progress', 'review', 'done'];
      if (!validStatuses.includes(req.body.status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      await db.none('UPDATE tasks SET status = $1 WHERE id = $2', [req.body.status, taskId]);
      return res.status(200).json({ success: true });
    }

    // Managers and admins — full update
    const { title, description, status, due_date, assignee, priority, worksite_id } = req.body;
    if (!due_date) {
      return res.status(400).json({ error: 'Due date is required' });
    }

    const validStatuses = ['backlog', 'in-progress', 'review', 'done'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const validPriorities = ['low', 'medium', 'high'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority value' });
    }

    let assigneeUser = null;
    if (assignee) {
      assigneeUser = await db.oneOrNone('SELECT id FROM users WHERE username = $1', [assignee]);
      if (!assigneeUser) {
        return res.status(400).json({ error: 'Assignee user does not exist' });
      }
    }

    const current = await db.oneOrNone('SELECT worksite_id FROM tasks WHERE id = $1', [taskId]);
    if (!current) return res.status(404).json({ error: 'Task not found' });

    const new_worksite_id = worksite_id ?? null;

    await db.none(
      `UPDATE tasks
       SET title = \${title}, description = \${description}, status = \${status},
           due_date = \${due_date}, assignee = \${assignee}, priority = \${priority},
           worksite_id = \${worksite_id}
       WHERE id = \${id}`,
      {
        id: taskId,
        title,
        description: description || null,
        status,
        due_date,
        assignee: assignee || null,
        priority,
        worksite_id: new_worksite_id,
      }
    );

    if (new_worksite_id !== current.worksite_id) {
      await db.none('INSERT INTO task_worksite_history (task_id, worksite_id) VALUES ($1, $2)', [taskId, new_worksite_id]);
    }

    // Sync task_assignments: clear old assignee, insert new one
    await db.none(
      `DELETE FROM task_assignments WHERE task_id = $1 AND role = 'assignee'`,
      [taskId]
    );
    if (assigneeUser) {
      await db.none(
        `INSERT INTO task_assignments (task_id, user_id, role)
         VALUES ($1, $2, 'assignee')
         ON CONFLICT (task_id, user_id) DO NOTHING`,
        [taskId, assigneeUser.id]
      );
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('PATCH task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Get worksite history for a task
app.get('/api/tasks/:id/worksite-history', authenticateToken, async (req, res) => {
  const taskId = parseInt(req.params.id);
  try {
    // Workers can only view history for tasks they created or are assigned to
    if (req.user.role === 'worker') {
      const access = await db.oneOrNone(
        `SELECT id FROM tasks
         WHERE id = $1
           AND (created_by = $2 OR id IN (SELECT task_id FROM task_assignments WHERE user_id = $2))`,
        [taskId, req.user.id]
      );
      if (!access) return res.status(403).json({ error: 'Forbidden' });
    }

    const history = await db.any(
      `SELECT twh.changed_at, w.name AS worksite_name, w.address, w.city, w.state
       FROM task_worksite_history twh
       LEFT JOIN worksites w ON w.id = twh.worksite_id
       WHERE twh.task_id = $1
       ORDER BY twh.changed_at DESC`,
      [taskId]
    );
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch worksite history' });
  }
});

// Delete task — managers and admins only
app.delete('/api/tasks/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const result = await db.result('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
