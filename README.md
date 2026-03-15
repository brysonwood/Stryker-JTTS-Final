# Stryker Job & Time Tracking System

Stryker JTTS is a field service job and time tracking application. It lets staff manage jobs, track technician time, upload job photos, record parts, and support admin workflows such as user management, audit history, and invoice-related processing.

## Tech Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, TypeScript, Express, Prisma
- Data services: PostgreSQL, Redis, MinIO

## Prerequisites

- Node.js 18+
- Docker Desktop running
- Git

## Quick Start

From the repository root:

```powershell
docker compose up -d --build
./scripts/setup.ps1 -StartDev
```

That script:

- copies `.env.example` to `.env` if needed
- starts the local services
- installs backend and frontend dependencies
- generates the Prisma client
- applies database migrations
- seeds the database
- opens backend and frontend dev servers

If you only want setup without opening dev servers:

```powershell
docker compose up -d --build
./scripts/setup.ps1
```

## Build And Run Manually

Start infrastructure:

```powershell
docker compose up -d --build
```

Run the backend:

```powershell
cd backend
npm install
npx prisma@5 generate --schema prisma/schema.prisma
npx prisma@5 migrate deploy --schema prisma/schema.prisma
npm run seed
npm run build
npm run dev
```

Run the frontend in a second terminal:

```powershell
cd frontend
npm install
npm run build
npm run dev
```

## Test Accounts

These accounts are created by the seed script and are for local testing only.

| Name | Email | Password | Role |
|------|-------|----------|------|
| Admin User | admin@example.local | AdminPass123! | Admin |
| Maria Garcia | maria.garcia@example.local | TechPass1! | Technician |
| Ethan Clark | ethan.clark@example.local | TechPass1! | Technician |
| Noah Patel | noah.patel@example.local | TechPass1! | Technician |

## Default Local URLs

- Frontend: http://localhost:3000
- Backend: http://localhost:4000
- MinIO Console: http://localhost:9001
- Adminer: http://localhost:8080

## Environment Notes

- `.env.example` provides the default local configuration.
- The setup script creates `.env` automatically if it does not exist.
- If you run backend tools from your host machine, `DATABASE_URL` should usually point to `localhost`.
- Inside containers, the database host is `postgres`.

## Tests

After setup, run the smoke tests from the repository root:

```powershell
node .\tests\node\run_all.js
```

You can override test settings with environment variables such as `API_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.

## Project Structure

- `frontend/` React client
- `backend/` Express API and Prisma code
- `scripts/` local setup helpers
- `tests/` smoke and integration tests

## Additional Notes

- `backend/scripts/seed.js` is safe to rerun.
- If setup fails, check that Docker Desktop is running before rerunning the script.