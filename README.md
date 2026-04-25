# Task Tracker

Task Tracker is a Dockerized work-order management app for coordinating tasks across real-world worksites. It combines a Kanban task board, role-aware task access, Google Maps location tools, and a manager map dashboard to streamline work order coordination and team communication.


## Features

- Shared responsive navigation bar across pages
- Popup login and registration modals
- JWT-backed authentication with hashed passwords
- Role-aware access for `admin`, `manager`, and `worker`
- Kanban board grouped by task status
- Token-based Kanban search/filter UI for task, assignee, worksite, and priority
- Manager/admin task creation, editing, deletion, and drag/drop status updates
- Optional task locations using Google Maps search or dropped pins
- Manager/admin map dashboard with task markers and marker detail popups
- Worksite creation and lookup
- Worksite location history
- Service status modal that checks:
  - PostgreSQL connectivity
  - Google Maps API reachability/configuration
- Service status history graph


## Tools

- Node.js 22
- Express 5
- PostgreSQL 16
- pg / pg-promise
- bcrypt
- JSON Web Tokens
- express-session with PostgreSQL session storage
- Bootstrap 5
- Google Maps JavaScript API
- Docker Compose
- Mocha, Chai, and chai-http for tests


## Prerequisites

- Docker Desktop
- Docker Compose
- A Google Maps API key with the Maps JavaScript API and Places library enabled
- A Gemini API key for the popup AI assistant

## Project Structure
`index.js`: Server entry point
`routes/`: API route definitions
`pages/`: HTML templates
`scripts/`: Client-side JavaScript
`src/init_data/`: Database schema
`test/`: Mocha test suite

## Environment

Create `ProjectSourceCode/.env` before running the app.

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=tasktracker
POSTGRES_HOST=db
POSTGRES_PORT=5432

# Server
PORT=3000
NODE_ENV=development

# Auth
JWT_SECRET=replace-with-a-long-random-secret
SESSION_SECRET=replace-with-a-long-random-session-secret

# Google Maps
GOOGLE_MAPS_API_KEY=replace-with-your-google-maps-api-key

# Gemini AI assistant
GEMINI_API_KEY=replace-with-your-gemini-api-key
```

To generate tokens for `JWT_SECRET` and `SESSION_SECRET`, you can use one of the following commands:

```bash
# openssl
openssl rand -base64 32

# node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```


## Running With Docker Compose

From the project source directory:

```bash
cd ProjectSourceCode
docker compose up
```

The web app will be available at:

```text
http://localhost:3000
```

To stop the app:

```bash
docker compose down
```
Use `down -v` when you need a fresh database initialized from the SQL files again.


## Testing

Run the automated test suite using Docker:

```bash
cd ProjectSourceCode
docker compose run web npm test
```


## Authentication And Roles

Users register through the popup registration modal. New users default to the `worker` role.

Supported roles:

- `worker`: can view tasks visible to that worker
- `manager`: can create, edit, delete, and map tasks
- `admin`: has manager-level task access

Manager/admin-only UI controls are hidden from workers. Protected API routes also enforce role checks server-side.

To promote a user manually, update the `users.role` column in PostgreSQL


## Task Workflow

Managers and admins can:

- Add tasks
- Edit tasks
- Delete tasks
- Drag tasks between Kanban columns
- Attach task locations by searching Google Maps or dropping a pin

Workers see task data based on the backend role filtering rules.


## Kanban Search And Filtering

The Kanban board has a token-based filter builder.

Usage:
1. Click the search field or `Add filter`.
2. Choose a property.
3. For Task, Assignee, or Worksite, type a value and press Enter or click away.
4. For Priority, choose High, Medium, or Low from the color-coded dropdown.
5. The filter becomes a read-only token.
6. Hover a token and click `X` to remove it.

Multiple tokens can be active. Visible tasks must match all active tokens.


## Map Dashboard

- Loads tasks with valid worksite latitude and longitude
- Renders task markers on Google Maps
- Shows task details when a marker is clicked
- Includes filters for mapped task visibility
- Requires a manager or admin account


## Service Status

The status modal checks:

- Database connection using a lightweight `SELECT 1`
- Google Maps API reachability and common Maps API error responses

The modal also:

- Auto-refreshes while open
- Tracks recent status history in `localStorage`
- Shows a small Bootstrap/SVG visual history graph
- Resets status history when the server starts a new build/session


## API Overview

> Auth

```text
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/get-user
PATCH  /api/auth/update-user
```

> Tasks

```text
GET     /api/tasks
GET     /api/tasks/map
POST    /api/tasks
PATCH   /api/tasks/:id
DELETE  /api/tasks/:id
GET     /api/tasks/:id/worksite-history
```

> Worksites

```text
GET   /api/worksites
POST  /api/worksites
```

> App Config And Status

```text
GET  /api/config
GET  /api/service-status
GET  /welcome
```


## Database Schema

The database is initialized from `ProjectSourceCode/src/init_data/00_create.sql`.

Core tables:

- `users`
- `tasks`
- `worksites`
- `task_assignments`
- `task_worksite_history`
- `session`

The Docker Postgres volume is named `group-project`.


## Common Troubleshooting

> Port 3000 is already in use

  Stop the existing process or change `PORT` in `ProjectSourceCode/.env`.

> Database changes are not showing up

Docker only runs SQL files in `docker-entrypoint-initdb.d` when the database volume is first created. Reset the volume:

```bash
cd ProjectSourceCode
docker compose down -v
docker compose up
```

> Google Maps does not load

Check that:

- `GOOGLE_MAPS_API_KEY` is set
- The key has Maps JavaScript API enabled
- The key has Places enabled
- Billing and referrer restrictions are configured correctly

The `Service Status` modal can help identify common Google Maps API key errors.

> AI assistant says `GEMINI_API_KEY is not configured on the server`

Add `GEMINI_API_KEY` to `ProjectSourceCode/.env`, then restart Docker Compose:

```bash
cd ProjectSourceCode
docker compose down
docker compose up
```

> Protected actions fail

Confirm that:

- You are logged in
- The browser has a current JWT in `localStorage`
- Your account role is `manager` or `admin` for create/edit/delete/map actions

## Team

This repository was built for CSCI 3308 as a team project. The original project planning document is linked below:

```text
https://docs.google.com/document/d/1SRScYYy3E2sv070ep3WinmRJvrtekTMD0JM-y2W9b-A/edit?usp=sharing
```

Team 7: "Team Choo Choo Trains"

- Hudson S
- Winston T
- Hudson V
- Ryken A
- Denzel G
- Joshua S
