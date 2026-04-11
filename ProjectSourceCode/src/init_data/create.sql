

CREATE TABLE "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
) WITH (OIDS=FALSE);
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX "IDX_session_expire" ON "session" ("expire");

CREATE TABLE IF NOT EXISTS worksites (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    address    TEXT,
    city       VARCHAR(100),
    state      VARCHAR(50),
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL       PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'worker'
                      CHECK (role IN ('admin', 'manager', 'worker')),
    worksite_id   INT          REFERENCES worksites(id) ON DELETE SET NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
    id          SERIAL       PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    status      VARCHAR(20)  NOT NULL DEFAULT 'backlog'
                    CHECK (status IN ('backlog', 'in-progress', 'review', 'done')),
    priority    VARCHAR(10)  NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high')),
    assignee    VARCHAR(100),
    created_by  INT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    worksite_id INT          REFERENCES worksites(id) ON DELETE SET NULL,
    due_date    TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_assignments (
    id          SERIAL      PRIMARY KEY,
    task_id     INT         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL DEFAULT 'assignee'
                    CHECK (role IN ('assignee', 'reviewer', 'observer')),
    assigned_at TIMESTAMP   NOT NULL DEFAULT NOW(),
 
    CONSTRAINT uq_task_user UNIQUE (task_id, user_id)
);
