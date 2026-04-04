# Automated tests — Stryker JTTS

This folder contains automated API smoke/integration tests and convenient wrappers to run them locally.

Purpose
- Provide repeatable checks for core functionality: health, auth, RBAC, customers/jobs/tasks/parts, media signed-upload flow, dashboard, invoice export, audit logs, retention, and PDF queue endpoints.
- Be runnable cross-platform (Node.js-based tests with small shell / PowerShell wrappers).

Prerequisites
- Node.js 18+ (for built-in `fetch`).
- Backend dev server running at `http://localhost:4000` (default). The seed script (`backend/scripts/seed.js`) is idempotent and safe to rerun; it will create or update the admin user and ensure sample data exists.
- Optional: `curl` / `jq` for manual curl-style checks.

Files
- `node/run_all.js` — main test runner (Node.js). Runs all API integration sections and prints `[PASS]`/`[FAIL]` per test.
- `run_all.sh` — simple bash wrapper that runs the Node test runner.
- `windows/run_all.ps1` — PowerShell wrapper that runs the Node test runner on Windows.

How to run

From the repository root (recommended):

```bash
# Unix / macOS
node ./tests/node/run_all.js
# or
./tests/run_all.sh
```

```powershell
# Windows PowerShell (from repo root)
node .\tests\node\run_all.js
# or
.\tests\windows\run_all.ps1
```

Notes
- The runner attempts end-to-end upload to your configured S3/MinIO if the signed URL is accepted. If MinIO/S3 is not available the test will still validate the signed URL creation and will report that the PUT step was skipped or failed.
- The runner reads environment variables from a `.env` file in the repo root if present (for `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `API_URL`).

If you want to add more tests, put them under `tests/node/` and update `run_all.js`.
