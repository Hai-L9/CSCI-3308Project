CREATE TABLE IF NOT EXISTS worksites (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    address    TEXT,
    city       VARCHAR(100),
    state      VARCHAR(50),
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);
