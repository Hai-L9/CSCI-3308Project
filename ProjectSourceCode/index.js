require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./src/resources/db.js');


if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');

const app = express();
const port = process.env.PORT || 3000;

// Single DB connection pool using POSTGRES_* vars
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST || 'db',
  database: process.env.POSTGRES_DB,
  port: process.env.POSTGRES_PORT || 5432,
});

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

app.get('/api/config', (req, res) => {
  res.json({ googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// Welcome route
app.get('/welcome', (req, res) => {
  req.session.visits = (req.session.visits || 0) + 1;
  res.status(200).json({ status: 'success', message: 'Welcome!', visits: req.session.visits });
});

// Get tasks
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    let tasks;
    if (req.user.role === 'worker') {
      tasks = await db.any(
        `SELECT t.*, w.name AS worksite_name, w.lat AS worksite_lat, w.lng AS worksite_lng
         FROM tasks t
         LEFT JOIN worksites w ON w.id = t.worksite_id
         WHERE t.created_by = $1
            OR t.id IN (
              SELECT task_id FROM task_assignments WHERE user_id = $1
            )`,
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

// Create task
app.post('/api/tasks', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  const query = `
    INSERT INTO tasks (title, description, status, due_date, created_by, priority, worksite_id)
    VALUES (\${title}, \${description}, \${status}, \${due_date}, \${created_by}, \${priority}, \${worksite_id})
    RETURNING id, created_at;
  `;
  try {
    const result = await db.one(query, {
      title: req.body.title,
      description: req.body.description,
      status: req.body.status || 'backlog',
      due_date: req.body.due_date || null,
      created_by: req.user.id,
      priority: req.body.priority || 'medium',
      worksite_id: req.body.worksite_id || null,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
app.patch('/api/tasks/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  const query = `
    UPDATE tasks
    SET title = \${title}, description = \${description}, status = \${status},
        due_date = \${due_date}, assignee = \${assignee}, priority = \${priority},
        worksite_id = \${worksite_id}
    WHERE id = \${id}
  `;
  try {
    const result = await db.result(query, {
      id: parseInt(req.params.id),
      title: req.body.title,
      description: req.body.description || null,
      status: req.body.status,
      due_date: req.body.due_date || null,
      assignee: req.body.assignee || null,
      priority: req.body.priority,
      worksite_id: req.body.worksite_id ?? null,
    });
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
app.delete('/api/tasks/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.result('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Routes
const auth = require('./routes/auth');
auth.init(pool);
app.use('/api/auth', auth.router);
const { authenticateToken } = auth;

const worksites = require('./routes/worksites');
worksites.init(pool);
app.use('/api/worksites', worksites.router);

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});



module.exports = app;
