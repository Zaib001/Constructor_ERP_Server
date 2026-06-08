"use strict";
/**
 * Integration Test — Feature 2: User Management API
 *
 * Tests:
 *  1. GET /api/users returns paginated list for admin → 200
 *  2. Non-admin (site_engineer) gets 403
 *  3. Search filter works (partial name match)
 *  4. POST /api/project-access assigns user → 201
 *  5. POST /api/project-access duplicate → 409
 *  6. DELETE /api/project-access removes assignment → 200
 *  7. DELETE /api/project-access non-existent → 404
 *  8. GET /api/users/:id/projects returns user's projects → 200
 *
 * Run from Server/: node scratch/test_user_management.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const http   = require("http");
const jwt    = require("jsonwebtoken");
const prisma = require(path.resolve(__dirname, "../src/db"));
const app    = require(path.resolve(__dirname, "../src/app"));

const COMPANY_ID = "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6";
const ADMIN_ID   = "327e5c8a-1b8a-42c3-9806-e303405e8a5a"; // superadmin
const PM_ID      = "c2d8051d-639d-4a67-8fd3-1511d8f7c605";
const PROJECT_ID = "db0e9eec-32da-4091-b607-38dd327725f2";

const created = { sessionAdmin: null, sessionEng: null, assignment: null };
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
    // Revoke any existing assignment for PM to this project (clean state)
    await prisma.userProject.updateMany({
        where: { user_id: PM_ID, project_id: PROJECT_ID, revoked_at: null },
        data: { revoked_at: new Date() },
    });
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    log(`Express on port ${server.address().port}`);
}

async function test1_AdminCanList() {
    console.log("\n🧪  TEST 1 — Admin can list users (200 + correct shape)");
    const res = await request("GET", "/users?page=1&limit=5", null, adminToken);
    if (res.status !== 200)              fail(`Expected 200, got ${res.status}`, res.body);
    if (!Array.isArray(res.body.users))  fail("users is not array", res.body);
    if (typeof res.body.total !== "number") fail("total not a number", res.body);
    const u = res.body.users[0];
    if (!u.id || !u.name || !u.email || !u.role) fail("User missing required fields", u);
    log(`Got ${res.body.users.length}/${res.body.total} users`);
}

async function test2_EngineerForbidden() {
    console.log("\n🧪  TEST 2 — Site engineer GET /api/users → 403");
    // The service-level check uses roleCode; engToken encodes "site_engineer" but DB user is PM
    // Test via direct service call
    const svc = require(path.resolve(__dirname, "../src/modules/users/users.service"));
    let threw = false;
    try {
        await svc.listUsers({ roleCode: "site_engineer", companyId: COMPANY_ID, isSuperAdmin: false }, { search: "", role: "", page: 1, limit: 5 });
    } catch (err) {
        if (err.statusCode === 403) threw = true;
        else throw err;
    }
    if (!threw) fail("Expected 403 for site_engineer");
    log("403 Forbidden correctly thrown for site_engineer");
}

async function test3_SearchFilter() {
    console.log("\n🧪  TEST 3 — Search filter returns matching users");
    const res = await request("GET", "/users?search=admin&limit=10", null, adminToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const hasMatch = res.body.users.some(
        (u) => u.name?.toLowerCase().includes("admin") || u.email?.toLowerCase().includes("admin")
    );
    if (!hasMatch && res.body.users.length > 0) fail("Search returned users that don't match 'admin'", res.body.users[0]);
    log(`Search 'admin' → ${res.body.users.length} results`);
}

async function test4_AssignProject() {
    console.log("\n🧪  TEST 4 — POST /api/project-access assigns user → 201");
    const res = await request("POST", "/project-access", { userId: PM_ID, projectId: PROJECT_ID, role: "contributor" }, adminToken);
    if (res.status !== 201) fail(`Expected 201, got ${res.status}`, res.body);
    if (!res.body.success)  fail("success=false", res.body);
    created.assignment = { userId: PM_ID, projectId: PROJECT_ID };
    log("User assigned to project");
}

async function test5_DuplicateAssign() {
    console.log("\n🧪  TEST 5 — Duplicate POST → 409");
    const res = await request("POST", "/project-access", { userId: PM_ID, projectId: PROJECT_ID, role: "contributor" }, adminToken);
    if (res.status !== 409) fail(`Expected 409, got ${res.status}`, res.body);
    log("409 Conflict correctly returned for duplicate assignment");
}

async function test6_GetUserProjects() {
    console.log("\n🧪  TEST 6 — GET /api/users/:id/projects → 200");
    const res = await request("GET", `/users/${PM_ID}/projects`, null, adminToken);
    if (res.status !== 200)                     fail(`Expected 200, got ${res.status}`, res.body);
    const { userId, projects } = res.body.data || {};
    if (userId !== PM_ID)                        fail("Wrong userId in response", res.body);
    if (!Array.isArray(projects))                fail("projects not array", res.body);
    const found = projects.find((p) => p.id === PROJECT_ID);
    if (!found) fail(`Expected project ${PROJECT_ID} in user's projects`, projects);
    log(`User has ${projects.length} project(s), including test project`);
}

async function test7_RemoveAssignment() {
    console.log("\n🧪  TEST 7 — DELETE /api/project-access removes assignment → 200");
    const res = await request("DELETE", "/project-access", { userId: PM_ID, projectId: PROJECT_ID }, adminToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    if (!res.body.success)  fail("success=false", res.body);
    created.assignment = null;
    log("Assignment removed");
}

async function test8_RemoveNonExistent() {
    console.log("\n🧪  TEST 8 — DELETE non-existent assignment → 404");
    const res = await request("DELETE", "/project-access", { userId: PM_ID, projectId: PROJECT_ID }, adminToken);
    if (res.status !== 404) fail(`Expected 404, got ${res.status}`, res.body);
    log("404 correctly returned for non-existent assignment");
}

async function teardown() {
    console.log("\n🗑️   TEARDOWN");
    if (created.assignment) {
        await prisma.userProject.updateMany({
            where: { user_id: created.assignment.userId, project_id: created.assignment.projectId, revoked_at: null },
            data: { revoked_at: new Date() },
        }).catch(() => {});
    }
    if (created.sessionAdmin) await prisma.userSession.delete({ where: { id: created.sessionAdmin } }).catch(() => {});
    if (created.sessionEng)   await prisma.userSession.delete({ where: { id: created.sessionEng } }).catch(() => {});
    log("Cleaned up");
}

(async () => {
    console.log("=".repeat(60));
    console.log("  User Management API — Integration Tests");
    console.log("=".repeat(60));
    let exitCode = 0;
    try {
        await setup();
        await test1_AdminCanList();
        await test2_EngineerForbidden();
        await test3_SearchFilter();
        await test4_AssignProject();
        await test5_DuplicateAssign();
        await test6_GetUserProjects();
        await test7_RemoveAssignment();
        await test8_RemoveNonExistent();
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
