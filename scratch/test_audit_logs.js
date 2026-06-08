"use strict";
/**
 * Integration Test — Feature 3: Audit Logs API
 *
 * Tests:
 *  1. Admin can fetch audit logs → 200 with correct shape
 *  2. Non-admin → 403
 *  3. userId filter returns only that user's logs
 *  4. actionType filter works
 *  5. entity filter works
 *  6. Date range filter (from/to) correctly bounds results
 *  7. Combined filters work together
 *  8. Pagination: page 2 returns next set
 *
 * Run from Server/: node scratch/test_audit_logs.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const http   = require("http");
const jwt    = require("jsonwebtoken");
const prisma = require(path.resolve(__dirname, "../src/db"));
const app    = require(path.resolve(__dirname, "../src/app"));

const ADMIN_ID = "327e5c8a-1b8a-42c3-9806-e303405e8a5a";
const PM_ID    = "c2d8051d-639d-4a67-8fd3-1511d8f7c605";

const created = { sessionAdmin: null, sessionEng: null, logIds: [] };
let server, adminToken, engToken;

const log  = (m) => console.log(`  ✔  ${m}`);
const fail = (m, d) => { console.error(`\n  ✘  FAIL: ${m}`); if (d) console.error("      Detail:", JSON.stringify(d, null, 2)); throw new Error(m); };

function mintToken(userId, roleCode) {
    return jwt.sign({ userId, roleCode }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function request(method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: "127.0.0.1", port: server.address().port,
            path: `/api${urlPath}`, method,
            headers: {
                "Content-Type": "application/json",
                ...(token   ? { Authorization: `Bearer ${token}` } : {}),
                ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            },
        };
        const req = http.request(opts, (res) => {
            let data = "";
            res.on("data", (c) => data += c);
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function setup() {
    console.log("\n📦  SETUP");
    adminToken = mintToken(ADMIN_ID, "super_admin");
    engToken   = mintToken(PM_ID,    "site_engineer");
    const as = await prisma.userSession.create({ data: { user_id: ADMIN_ID, jwt_token: adminToken, is_active: true } });
    const es = await prisma.userSession.create({ data: { user_id: PM_ID,    jwt_token: engToken,   is_active: true } });
    created.sessionAdmin = as.id;
    created.sessionEng   = es.id;

    // Seed known audit log rows for filter tests
    const rows = await prisma.auditLog.createManyAndReturn({
        data: [
            { user_id: PM_ID,    module: "test", entity: "PR",   action: "SUBMIT",  created_at: new Date("2024-06-01") },
            { user_id: PM_ID,    module: "test", entity: "PR",   action: "APPROVE", created_at: new Date("2024-07-01") },
            { user_id: ADMIN_ID, module: "test", entity: "USER", action: "CREATE",  created_at: new Date("2024-08-01") },
            { user_id: ADMIN_ID, module: "test", entity: "USER", action: "UPDATE",  created_at: new Date("2024-09-01") },
        ],
    }).catch(async () => {
        // createManyAndReturn may not be available; fall back
        const r1 = await prisma.auditLog.create({ data: { user_id: PM_ID,    module: "test", entity: "PR",   action: "SUBMIT",  created_at: new Date("2024-06-01") } });
        const r2 = await prisma.auditLog.create({ data: { user_id: PM_ID,    module: "test", entity: "PR",   action: "APPROVE", created_at: new Date("2024-07-01") } });
        const r3 = await prisma.auditLog.create({ data: { user_id: ADMIN_ID, module: "test", entity: "USER", action: "CREATE",  created_at: new Date("2024-08-01") } });
        const r4 = await prisma.auditLog.create({ data: { user_id: ADMIN_ID, module: "test", entity: "USER", action: "UPDATE",  created_at: new Date("2024-09-01") } });
        return [r1, r2, r3, r4];
    });
    created.logIds = rows.map((r) => r.id);

    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    log(`Seeded ${created.logIds.length} test log rows, server on port ${server.address().port}`);
}

async function test1_AdminCanFetch() {
    console.log("\n🧪  TEST 1 — Admin can fetch logs → 200 + correct shape");
    const res = await request("GET", "/audit/logs?limit=5", null, adminToken);
    if (res.status !== 200)               fail(`Expected 200, got ${res.status}`, res.body);
    if (!Array.isArray(res.body.logs))    fail("logs not array", res.body);
    if (typeof res.body.total !== "number") fail("total not number", res.body);
    const l = res.body.logs[0];
    if (!l) { log("No logs yet — shape check skipped"); return; }
    if (typeof l.id !== "string")         fail("log.id not string", l);
    if (!l.timestamp)                     fail("log.timestamp missing", l);
    if (!l.actionType && !l.action)       fail("log.actionType missing", l);
    log(`200 OK — ${res.body.logs.length}/${res.body.total} logs`);
}

async function test2_NonAdminForbidden() {
    console.log("\n🧪  TEST 2 — Non-admin → 403");
    const res = await request("GET", "/audit/logs", null, engToken);
    if (res.status !== 403) fail(`Expected 403, got ${res.status}`, res.body);
    log("403 correctly returned for non-admin");
}

async function test3_UserIdFilter() {
    console.log("\n🧪  TEST 3 — userId filter returns only that user's logs");
    const res = await request("GET", `/audit/logs?userId=${PM_ID}&limit=50`, null, adminToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const nonMatch = res.body.logs.filter((l) => l.user?.id && l.user.id !== PM_ID);
    if (nonMatch.length > 0) fail("Got logs for a different user", nonMatch[0]);
    log(`userId filter: ${res.body.logs.length} logs for PM`);
}

async function test4_ActionTypeFilter() {
    console.log("\n🧪  TEST 4 — actionType filter");
    const res = await request("GET", "/audit/logs?actionType=SUBMIT&limit=50", null, adminToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const nonMatch = res.body.logs.filter((l) => !l.actionType?.toUpperCase().includes("SUBMIT"));
    if (nonMatch.length > 0) fail("Got logs with different action", nonMatch[0]);
    log(`actionType=SUBMIT → ${res.body.logs.length} logs`);
}

async function test5_EntityFilter() {
    console.log("\n🧪  TEST 5 — entity filter");
    const res = await request("GET", "/audit/logs?entity=USER&limit=50", null, adminToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const nonMatch = res.body.logs.filter((l) => l.entity && !l.entity.toUpperCase().includes("USER"));
    if (nonMatch.length > 0) fail("Got logs with different entity", nonMatch[0]);
    log(`entity=USER → ${res.body.logs.length} logs`);
}

async function test6_DateRangeFilter() {
    console.log("\n🧪  TEST 6 — date range filter");
    const res = await request("GET", "/audit/logs?from=2024-05-01&to=2024-07-31&limit=50", null, adminToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const outOfRange = res.body.logs.filter((l) => {
        const d = new Date(l.timestamp);
        return d < new Date("2024-05-01") || d > new Date("2024-07-31T23:59:59Z");
    });
    if (outOfRange.length > 0) fail("Got logs outside date range", outOfRange[0]);
    const pmLogs = res.body.logs.filter((l) => l.user?.id === PM_ID && l.actionType?.includes("SUBMIT"));
    if (pmLogs.length === 0) fail("Expected SUBMIT log from June 2024 in range");
    log(`date range 2024-05 to 2024-07: ${res.body.logs.length} logs`);
}

async function test7_CombinedFilters() {
    console.log("\n🧪  TEST 7 — combined filters");
    const res = await request("GET", `/audit/logs?userId=${PM_ID}&actionType=APPROVE&limit=50`, null, adminToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const nonMatch = res.body.logs.filter((l) => l.user?.id !== PM_ID || !l.actionType?.toUpperCase().includes("APPROVE"));
    if (nonMatch.length > 0) fail("Combined filter returned non-matching log", nonMatch[0]);
    log(`Combined userId+actionType → ${res.body.logs.length} logs`);
}

async function test8_Pagination() {
    console.log("\n🧪  TEST 8 — pagination (page 2 returns next set)");
    const pg1 = await request("GET", "/audit/logs?page=1&limit=2", null, adminToken);
    const pg2 = await request("GET", "/audit/logs?page=2&limit=2", null, adminToken);
    if (pg1.status !== 200) fail("page 1 failed", pg1.body);
    if (pg2.status !== 200) fail("page 2 failed", pg2.body);
    if (pg1.body.logs.length > 0 && pg2.body.logs.length > 0) {
        const p1ids = pg1.body.logs.map((l) => l.id);
        const overlap = pg2.body.logs.filter((l) => p1ids.includes(l.id));
        if (overlap.length > 0) fail("Page 2 contains page 1 entries");
    }
    log(`page 1: ${pg1.body.logs.length} logs, page 2: ${pg2.body.logs.length} logs — no overlap`);
}

async function teardown() {
    console.log("\n🗑️   TEARDOWN");
    if (created.logIds.length) {
        await prisma.auditLog.deleteMany({ where: { id: { in: created.logIds } } }).catch(() => {});
    }
    if (created.sessionAdmin) await prisma.userSession.delete({ where: { id: created.sessionAdmin } }).catch(() => {});
    if (created.sessionEng)   await prisma.userSession.delete({ where: { id: created.sessionEng   } }).catch(() => {});
    log("Cleaned up");
}

(async () => {
    console.log("=".repeat(60));
    console.log("  Audit Logs API — Integration Tests");
    console.log("=".repeat(60));
    let exitCode = 0;
    try {
        await setup();
        await test1_AdminCanFetch();
        await test2_NonAdminForbidden();
        await test3_UserIdFilter();
        await test4_ActionTypeFilter();
        await test5_EntityFilter();
        await test6_DateRangeFilter();
        await test7_CombinedFilters();
        await test8_Pagination();
        console.log("\n" + "=".repeat(60));
        console.log("  🎉  ALL TESTS PASSED");
        console.log("=".repeat(60));
    } catch (err) {
        console.error(`\n💥  Test failed: ${err.message}`);
        exitCode = 1;
    } finally {
        await teardown().catch(() => {});
        if (server) server.close();
        await prisma.$disconnect();
        console.log("\n✅  Done.\n");
        process.exit(exitCode);
    }
})();
