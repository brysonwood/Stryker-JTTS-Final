const fs   = require("fs");
const path = require("path");

// ENV loading.
function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "..", "..", ".env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    fs.readFileSync(p, "utf8").split(/\r?\n/).forEach(line => {
      if (!line || line.startsWith("#")) return;
      const idx = line.indexOf("=");
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    });
    break;
  }
}

// Test runner.
let passed = 0;
let failed = 0;
const failures = [];

async function test(label, fn) {
  process.stdout.write("  " + label + " ... ");
  try {
    await fn();
    passed++;
    console.log("[PASS]");
  } catch (err) {
    failed++;
    failures.push({ label, message: err.message });
    console.log("[FAIL]  -- " + err.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// HTTP helpers
let API_URL;

async function apiFetch(urlPath, opts = {}) {
  const { method = "GET", token, body } = opts;
  const headers = { "content-type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const fetchOpts = { method, headers };
  if (body !== undefined) fetchOpts.body = JSON.stringify(body);
  const res = await fetch(API_URL + urlPath, fetchOpts);
  let json = null;
  try { json = await res.json(); } catch {} // response body may be empty or non-JSON
  return { status: res.status, ok: res.ok, body: json };
}

async function apiFetchRaw(urlPath, opts = {}) {
  const { method = "GET", token, body } = opts;
  const headers = { "content-type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const fetchOpts = { method, headers };
  if (body !== undefined) fetchOpts.body = JSON.stringify(body);
  const res = await fetch(API_URL + urlPath, fetchOpts);
  const text = await res.text();
  return { status: res.status, ok: res.ok, text, headers: res.headers };
}

async function run() {
  loadEnv();
  API_URL             = process.env.API_URL || process.env.BACKEND_URL || "http://localhost:4000";
  const adminEmail    = process.env.ADMIN_EMAIL    || "admin@example.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "AdminPass123!";

  console.log("\n=== Stryker JTTS Integration Tests ===");
  console.log("  API  : " + API_URL);
  console.log("  user : " + adminEmail + "\n");

  // 1 Health
  console.log("--- Section 1: Health ---");
  await test("GET /health returns 200", async () => {
    const { status } = await apiFetch("/health");
    assert(status === 200, "expected 200, got " + status);
  });

  // 2 Auth
  console.log("\n--- Section 2: Authentication ---");
  await test("Bad credentials return 401", async () => {
    const { status } = await apiFetch("/api/auth/login", { method: "POST", body: { email: "nobody@x.test", password: "wrong" } });
    assert(status === 401, "expected 401, got " + status);
  });

  let token, refreshToken;
  await test("Login with valid admin credentials", async () => {
    const { status, body } = await apiFetch("/api/auth/login", { method: "POST", body: { email: adminEmail, password: adminPassword } });
    assert(status === 200, "expected 200, got " + status + ": " + (body && body.error));
    assert(body && body.accessToken, "expected accessToken");
    token        = body.accessToken;
    refreshToken = body.refreshToken;
  });

  await test("Refresh token returns new access token", async () => {
    if (!refreshToken) throw new Error("no refresh token (login failed)");
    const { status, body } = await apiFetch("/api/auth/refresh", { method: "POST", body: { refreshToken } });
    assert(status === 200, "expected 200, got " + status);
    assert(body && body.accessToken, "expected accessToken in refresh response");
  });

  // 3 RBAC
  console.log("\n--- Section 3: Authorization ---");
  await test("No token on protected route returns 401", async () => {
    const { status } = await apiFetch("/api/jobs");
    assert(status === 401, "expected 401, got " + status);
  });
  await test("Malformed token returns 401", async () => {
    const { status } = await apiFetch("/api/jobs", { token: "not.a.valid.jwt" });
    assert(status === 401, "expected 401, got " + status);
  });
  await test("Admin can reach admin-only endpoint (POST /api/customers)", async () => {
    if (!token) throw new Error("no token (login failed)");
    const { status } = await apiFetch("/api/customers", { method: "POST", token, body: { name: "RBAC-check-" + Date.now() } });
    assert(status === 201, "admin token should get 201, got " + status);
  });

  // 4 Customers
  console.log("\n--- Section 4: Customers ---");
  let customerId;
  await test("GET /api/customers returns list", async () => {
    const { status, body } = await apiFetch("/api/customers", { token });
    assert(status === 200, "expected 200, got " + status);
    assert(body && Array.isArray(body.customers), "expected body.customers array");
    if (body.customers.length > 0) customerId = body.customers[0].id;
  });
  await test("POST /api/customers creates customer", async () => {
    const { status, body } = await apiFetch("/api/customers", { method: "POST", token, body: { name: "Automation Validation Customer " + Date.now() } });
    assert(status === 201, "expected 201, got " + status + ": " + JSON.stringify(body));
    assert(body && body.customer && body.customer.id, "expected customer.id");
    customerId = body.customer.id;
  });
  await test("POST /api/customers without auth returns 401", async () => {
    const { status } = await apiFetch("/api/customers", { method: "POST", body: { name: "no-auth" } });
    assert(status === 401, "expected 401, got " + status);
  });

  // 5 Jobs
  console.log("\n--- Section 5: Jobs ---");
  let jobId;
  await test("GET /api/jobs returns list", async () => {
    const { status, body } = await apiFetch("/api/jobs", { token });
    assert(status === 200, "expected 200, got " + status);
    assert(body && Array.isArray(body.jobs), "expected body.jobs array");
    if (body.jobs.length > 0 && !jobId) jobId = body.jobs[0].id;
  });
  await test("POST /api/jobs creates job", async () => {
    if (!customerId) throw new Error("no customerId");
    const { status, body } = await apiFetch("/api/jobs", { method: "POST", token, body: { customerId, description: "Automation Validation Work Order " + Date.now(), priority: 2 } });
    assert(status === 201, "expected 201, got " + status + ": " + JSON.stringify(body));
    assert(body && body.job && body.job.id, "expected job.id");
    jobId = body.job.id;
  });
  await test("GET /api/jobs/:id returns job detail", async () => {
    if (!jobId) throw new Error("no jobId");
    const { status, body } = await apiFetch("/api/jobs/" + jobId, { token });
    assert(status === 200, "expected 200, got " + status);
    assert(body && body.job && body.job.id === jobId, "job.id mismatch");
  });
  await test("PATCH /api/jobs/:id updates status", async () => {
    if (!jobId) throw new Error("no jobId");
    const { status, body } = await apiFetch("/api/jobs/" + jobId, { method: "PATCH", token, body: { status: "in_progress" } });
    assert(status === 200, "expected 200, got " + status);
    assert(body && body.job && body.job.status === "in_progress", "expected status in_progress, got " + (body && body.job && body.job.status));
  });
  await test("POST /api/jobs missing description returns 400", async () => {
    const { status } = await apiFetch("/api/jobs", { method: "POST", token, body: { customerId: 1 } });
    assert(status === 400, "expected 400, got " + status);
  });

  // 6 Tasks
  console.log("\n--- Section 6: Tasks ---");
  let taskId;
  await test("POST /api/jobs/:id/tasks creates task", async () => {
    if (!jobId) throw new Error("no jobId");
    const { status, body } = await apiFetch("/api/jobs/" + jobId + "/tasks", { method: "POST", token, body: { description: "Validation task", estimatedHrs: 1.5 } });
    assert(status === 201, "expected 201, got " + status + ": " + JSON.stringify(body));
    assert(body && body.task && body.task.id, "expected task.id");
    taskId = body.task.id;
  });
  await test("PATCH /api/jobs/:id/tasks/:taskId updates task", async () => {
    if (!taskId || !jobId) throw new Error("no taskId");
    const { status, body } = await apiFetch("/api/jobs/" + jobId + "/tasks/" + taskId, { method: "PATCH", token, body: { status: "done" } });
    assert(status === 200, "expected 200, got " + status);
    assert(body && body.task && body.task.status === "done", "expected status done");
  });

  // 7 Parts
  console.log("\n--- Section 7: Parts ---");
  let partId;
  await test("POST /api/jobs/:id/parts adds a part", async () => {
    if (!jobId) throw new Error("no jobId");
    const { status, body } = await apiFetch("/api/jobs/" + jobId + "/parts", { method: "POST", token, body: { sku: "WD-40", description: "Lubricant", quantity: 2, unitPrice: 5.99 } });
    assert(status === 201, "expected 201, got " + status + ": " + JSON.stringify(body));
    assert(body && body.part && body.part.id, "expected part.id");
    partId = body.part.id;
  });
  await test("GET /api/jobs/:id/parts lists parts", async () => {
    if (!jobId) throw new Error("no jobId");
    const { status, body } = await apiFetch("/api/jobs/" + jobId + "/parts", { token });
    assert(status === 200, "expected 200, got " + status);
    assert(body && Array.isArray(body.parts) && body.parts.length > 0, "expected at least one part");
  });
  await test("SKU is saved as uppercase", async () => {
    if (!jobId) throw new Error("no jobId");
    const { body } = await apiFetch("/api/jobs/" + jobId + "/parts", { method: "POST", token, body: { sku: "bolt-m6", quantity: 1 } });
    assert(body && body.part && body.part.sku === "BOLT-M6", "expected BOLT-M6, got " + (body && body.part && body.part.sku));
  });
  await test("DELETE /api/jobs/:id/parts/:partId removes part", async () => {
    if (!partId || !jobId) throw new Error("no partId");
    const { status } = await apiFetch("/api/jobs/" + jobId + "/parts/" + partId, { method: "DELETE", token });
    assert(status === 204, "expected 204, got " + status);
  });
  await test("DELETE unknown part returns 404", async () => {
    const { status } = await apiFetch("/api/jobs/" + jobId + "/parts/999999", { method: "DELETE", token });
    assert(status === 404, "expected 404, got " + status);
  });

  // 8 Time Entries
  console.log("\n--- Section 8: Time Entries ---");
  await test("POST /api/time-entries creates entry", async () => {
    if (!jobId) throw new Error("no jobId");
    const start = new Date(Date.now() - 30 * 60000).toISOString();
    const end   = new Date().toISOString();
    const { status, body } = await apiFetch("/api/time-entries", { method: "POST", token, body: { jobId, start, end, notes: "automation validation", billable: true } });
    assert(status === 200 || status === 201, "expected 200/201, got " + status + ": " + JSON.stringify(body));
    assert(body && body.entry && body.entry.id, "expected entry.id");
    assert(!(body.entry.user && body.entry.user.password), "password MUST NOT appear in response");
  });
  await test("GET /api/jobs/:id/time-entries returns list", async () => {
    if (!jobId) throw new Error("no jobId");
    const { status, body } = await apiFetch("/api/jobs/" + jobId + "/time-entries", { token });
    assert(status === 200, "expected 200, got " + status);
    assert(body && Array.isArray(body.entries), "expected body.entries array");
  });

  // 9 Media
  console.log("\n--- Section 9: Media ---");
  let uploadKey;
  await test("POST /api/media/upload-init returns URL and key", async () => {
    const { status, body } = await apiFetch("/api/media/upload-init", { method: "POST", token, body: { filename: "validation-" + Date.now() + ".txt", mime: "text/plain", size: 6 } });
    assert(status === 200, "expected 200, got " + status + ": " + JSON.stringify(body));
    assert(body && body.uploadUrl, "expected uploadUrl");
    assert(body && body.key, "expected key");
    uploadKey = body.key;
  });
  await test("POST /api/media/complete records photo metadata", async () => {
    if (!jobId || !uploadKey) throw new Error("missing jobId or uploadKey");
    const { status, body } = await apiFetch("/api/media/complete", { method: "POST", token, body: { key: uploadKey, jobId, mime: "text/plain", size: 6 } });
    assert(status === 200, "expected 200, got " + status + ": " + JSON.stringify(body));
    assert(body && body.photo && body.photo.id, "expected photo.id");
    assert(!(body.photo.uploader && body.photo.uploader.password), "password MUST NOT appear in uploader");
  });

  // 10 Admin dashboard
  console.log("\n--- Section 10: Admin Dashboard ---");
  await test("GET /api/admin/dashboard without auth returns 401", async () => {
    const { status } = await apiFetch("/api/admin/dashboard");
    assert(status === 401, "expected 401, got " + status);
  });
  await test("GET /api/admin/dashboard returns aggregate payload", async () => {
    const { status, body } = await apiFetch("/api/admin/dashboard?days=30", { token });
    assert(status === 200, "expected 200, got " + status + ": " + JSON.stringify(body));
    assert(body && body.totals && typeof body.totals.jobs === "number", "expected totals.jobs number");
    assert(body && body.charts && Array.isArray(body.charts.timeByEmployee), "expected charts.timeByEmployee array");
    assert(body && body.charts && Array.isArray(body.charts.hoursByJob), "expected charts.hoursByJob array");
    assert(body && body.charts && Array.isArray(body.charts.partsCosts), "expected charts.partsCosts array");
  });

  // 11 Invoice export
  console.log("\n--- Section 11: Invoice Export ---");
  await test("GET /api/invoices/export without auth returns 401", async () => {
    const { status } = await apiFetch("/api/invoices/export?format=json");
    assert(status === 401, "expected 401, got " + status);
  });
  await test("GET /api/invoices/export JSON returns aggregate payload", async () => {
    if (!jobId) throw new Error("no jobId");
    const { status, body } = await apiFetch("/api/invoices/export?format=json&jobId=" + jobId, { token });
    assert(status === 200, "expected 200, got " + status + ": " + JSON.stringify(body));
    assert(body && body.totals && typeof body.totals.grandTotal === "number", "expected totals.grandTotal number");
    assert(body && Array.isArray(body.jobs), "expected jobs array");
    assert(body.jobs.length === 1, "expected exactly one job in export, got " + body.jobs.length);
  });
  await test("GET /api/invoices/export CSV returns csv content", async () => {
    if (!jobId) throw new Error("no jobId");
    const { status, text, headers } = await apiFetchRaw("/api/invoices/export?format=csv&jobId=" + jobId, { token });
    assert(status === 200, "expected 200, got " + status);
    assert(typeof text === "string" && text.includes("jobId,jobDescription,customer,status"), "expected csv header line");
    const contentType = headers.get("content-type") || "";
    assert(contentType.includes("text/csv"), "expected text/csv content-type, got " + contentType);
  });

  // 12 Audit logs
  console.log("\n--- Section 12: Audit Logs ---");
  await test("GET /api/admin/audit-logs without auth returns 401", async () => {
    const { status } = await apiFetch("/api/admin/audit-logs");
    assert(status === 401, "expected 401, got " + status);
  });
  await test("GET /api/admin/audit-logs returns logs array", async () => {
    const { status, body } = await apiFetch("/api/admin/audit-logs?limit=100", { token });
    assert(status === 200, "expected 200, got " + status + ": " + JSON.stringify(body));
    assert(body && Array.isArray(body.logs), "expected logs array");
    assert(body.logs.length > 0, "expected at least one audit log");
  });
  await test("Audit logs include customer create action", async () => {
    const { status, body } = await apiFetch("/api/admin/audit-logs?entity=customer&action=create&limit=100", { token });
    assert(status === 200, "expected 200, got " + status);
    assert(body && Array.isArray(body.logs), "expected logs array");
    const hasCreate = body.logs.some((log) => log.entity === "customer" && log.action === "create");
    assert(hasCreate, "expected customer create audit log");
  });

  // 13 Media retention
  console.log("\n--- Section 13: Media Retention ---");
  await test("POST /api/admin/media/retention-cleanup without auth returns 401", async () => {
    const { status } = await apiFetch("/api/admin/media/retention-cleanup", { method: "POST", body: { dryRun: true } });
    assert(status === 401, "expected 401, got " + status);
  });
  await test("POST /api/admin/media/retention-cleanup dry-run returns stats", async () => {
    const { status, body } = await apiFetch("/api/admin/media/retention-cleanup", { method: "POST", token, body: { dryRun: true, retentionDays: 21 } });
    assert(status === 200, "expected 200, got " + status + ": " + JSON.stringify(body));
    assert(body && body.dryRun === true, "expected dryRun true");
    assert(body && typeof body.matched === "number", "expected matched number");
    assert(body && typeof body.deletedRecords === "number", "expected deletedRecords number");
    assert(body && typeof body.deletedObjects === "number", "expected deletedObjects number");
    assert(body && typeof body.failures === "number", "expected failures number");
  });

  // 14 PDF queue
  console.log("\n--- Section 14: PDF Queue ---");
  let pdfQueueJobId;
  await test("POST /api/invoices/pdf-jobs without auth returns 401", async () => {
    const { status } = await apiFetch("/api/invoices/pdf-jobs", { method: "POST", body: { jobId } });
    assert(status === 401, "expected 401, got " + status);
  });
  await test("POST /api/invoices/pdf-jobs returns accepted queue job", async () => {
    const { status, body } = await apiFetch("/api/invoices/pdf-jobs", { method: "POST", token, body: { jobId } });
    assert(status === 202, "expected 202, got " + status + ": " + JSON.stringify(body));
    assert(body && body.job && body.job.id, "expected queued job id");
    assert(body.job.state === "queued", "expected queued state");
    pdfQueueJobId = body.job.id;
  });
  await test("GET /api/invoices/pdf-jobs/:id returns queue status", async () => {
    if (!pdfQueueJobId) throw new Error("no pdf queue job id");
    const { status, body } = await apiFetch("/api/invoices/pdf-jobs/" + pdfQueueJobId, { token });
    assert(status === 200, "expected 200, got " + status + ": " + JSON.stringify(body));
    assert(body && body.job && body.job.id === pdfQueueJobId, "expected same queue job id");
  });

  // Summary
  const total = passed + failed;
  console.log("\n=== Results: " + passed + "/" + total + " passed" + (failed > 0 ? ", " + failed + " FAILED" : "") + " ===");
  if (failures.length > 0) {
    console.log("\nFailed tests:");
    failures.forEach(f => console.log("  [FAIL] " + f.label + "  --  " + f.message));
    process.exit(1);
  }
  console.log("\nALL TESTS PASSED\n");
  process.exit(0);
}

run().catch(e => { console.error("\nFatal error:", e); process.exit(99); });