-- ============================================================
-- test.sql
-- Quick insert + read test for all 4 tables
-- Run with: psql $DATABASE_URL -f validation_test.sql
-- or inside docker: docker exec -it <db_container> psql -U postgres -d users_db -f validation_test.sql
-- ============================================================

-- ── Clean slate before testing ────────────────────────────
-- Removes any leftover test data so this file is safe to re-run
DELETE FROM task_assignments WHERE user_id IN (SELECT id FROM users WHERE username = 'test_user');
DELETE FROM tasks           WHERE title = 'Test Task';
DELETE FROM users           WHERE username = 'test_user';
DELETE FROM worksites       WHERE name = 'Test Worksite';

-- ── 1. Insert a worksite ──────────────────────────────────
INSERT INTO worksites (name, address, city, state)
VALUES ('Test Worksite', '123 Test St', 'Boulder', 'CO');

-- Read it back
SELECT id, name, city, state, is_active, created_at
FROM worksites
WHERE name = 'Test Worksite';

-- ── 2. Insert a user ──────────────────────────────────────
-- worksite_id references the worksite we just inserted
INSERT INTO users (username, email, password_hash, role, worksite_id)
VALUES (
    'test_user',
    'test@example.com',
    '$2b$10$examplehashforvalidationAAAAAAAAAAAAAAAAAAAAAAAA',
    'worker',
    (SELECT id FROM worksites WHERE name = 'Test Worksite')
);

-- Read it back
SELECT id, username, email, role, worksite_id, created_at
FROM users
WHERE username = 'test_user';

-- ── 3. Insert a task ──────────────────────────────────────
-- created_by and worksite_id reference the user and worksite above
INSERT INTO tasks (title, description, status, priority, created_by, worksite_id)
VALUES (
    'Test Task',
    'This is a validation test task.',
    'todo',
    'medium',
    (SELECT id FROM users WHERE username = 'test_user'),
    (SELECT id FROM worksites WHERE name = 'Test Worksite')
);

-- Read it back
SELECT id, title, status, priority, created_by, worksite_id, created_at
FROM tasks
WHERE title = 'Test Task';

-- ── 4. Insert a task assignment ───────────────────────────
-- Links the test user to the test task
INSERT INTO task_assignments (task_id, user_id, role)
VALUES (
    (SELECT id FROM tasks WHERE title = 'Test Task'),
    (SELECT id FROM users WHERE username = 'test_user'),
    'assignee'
);

-- Read it back
SELECT id, task_id, user_id, role, assigned_at
FROM task_assignments
WHERE user_id = (SELECT id FROM users WHERE username = 'test_user');

-- ── 5. Full join — confirm everything connects ────────────
-- This is the real validation — checks all 4 tables link correctly
SELECT
    u.username,
    u.email,
    u.role          AS user_role,
    w.name          AS worksite,
    t.title         AS task,
    t.status        AS task_status,
    ta.role         AS assignment_role
FROM task_assignments ta
JOIN users     u ON u.id = ta.user_id
JOIN tasks     t ON t.id = ta.task_id
JOIN worksites w ON w.id = t.worksite_id
WHERE u.username = 'test_user';

-- ── 6. Clean up test data ─────────────────────────────────
DELETE FROM task_assignments WHERE user_id = (SELECT id FROM users WHERE username = 'test_user');
DELETE FROM tasks           WHERE title = 'Test Task';
DELETE FROM users           WHERE username = 'test_user';
DELETE FROM worksites       WHERE name = 'Test Worksite';

-- Confirm cleanup
SELECT 'task_assignments cleared' AS status, COUNT(*) AS remaining FROM task_assignments WHERE user_id NOT IN (SELECT id FROM users);
SELECT 'cleanup complete' AS status;
