"use strict";
/**
 * Integration Test — Feature 1: Budget vs Actual API
 *
 * Tests:
 *  1. PM can fetch budget-vs-actual → 200 with correct shape
 *  2. Site engineer is rejected → 403
 *  3. Unknown projectId → 404
 *  4. Cost codes with actuals > budget show OVERSPENT
 *  5. Cost codes with actuals > 85% budget show AT_RISK
 *  6. Date range filter correctly limits actuals
 *
 * Run from Server/: node scratch/test_budget_vs_actual.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const http   = require("http");
const jwt    = require("jsonwebtoken");
const prisma = require(path.resolve(__dirname, "../src/db"));
const app    = require(path.resolve(__dirname, "../src/app"));

// ─── Fixtures (confirmed from DB) ────────────────────────────────────────────
const COMPANY_ID  = "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6";
const PM_ID       = "c2d8051d-639d-4a67-8fd3-1511d8f7c605";
const ENGINEER_ID = "327e5c8a-1b8a-42c3-9806-e303405e8a5a"; // super_admin (bypasses scoping)
const PROJECT_ID  = "db0e9eec-32da-4091-b607-38dd327725f2";

const created = {
    sessionPM:  null,
    sessionEng: null,
    wbsId:      null,
    ccId:       null,
    expenseId:  null,
};

let server, pmToken, engToken;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Setup ────────────────────────────────────────────────────────────────────
async function setup() {
    console.log("\n📦  SETUP");

    // Mint tokens
    pmToken  = mintToken(PM_ID, "project_manager");
    engToken = mintToken(ENGINEER_ID, "site_engineer");

    const pmSess  = await prisma.userSession.create({ data: { user_id: PM_ID, jwt_token: pmToken, is_active: true } });
    const engSess = await prisma.userSession.create({ data: { user_id: ENGINEER_ID, jwt_token: engToken, is_active: true } });
    created.sessionPM  = pmSess.id;
    created.sessionEng = engSess.id;
    log("Minted JWT sessions for PM and engineer");

    // Seed a WBS + CostCode with a known budget
    const wbs = await prisma.wBS.create({
        data: {
            project_id: PROJECT_ID,
            wbs_code: "TEST-WBS-BVA",
            name: "Test Budget WBS",
            status: "active",
        },
    });
    created.wbsId = wbs.id;

    const cc = await prisma.costCode.create({
        data: {
            wbs_id: wbs.id,
            category: "material",
            budget_amount: 100000,
            actual_amount: 0,
        },
    });
    created.ccId = cc.id;
    log(`Seeded WBS [${wbs.id}] + CostCode [${cc.id}] budget=100,000`);

    // Start server
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    log(`Express listening on port ${server.address().port}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function test1_PMCanFetch() {
    console.log("\n🧪  TEST 1 — PM can fetch budget-vs-actual (200 + correct shape)");
    const res = await request("GET", `/projects/${PROJECT_ID}/finance/budget-vs-actual`, null, pmToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const d = res.body.data;
    if (!d.projectId)                    fail("Missing projectId in response", d);
    if (!d.currency)                     fail("Missing currency", d);
    if (!d.summary)                      fail("Missing summary", d);
    if (!Array.isArray(d.items))         fail("items is not an array", d);
    if (typeof d.summary.totalBudget !== "number") fail("totalBudget not a number", d.summary);
    log(`200 OK — ${d.items.length} cost-code rows, currency=${d.currency}`);
}

async function test2_EngineerForbidden() {
    console.log("\n🧪  TEST 2 — Site engineer is rejected (403)");
    // Re-mint as site_engineer role (not super_admin)
    const seToken = jwt.sign({ userId: PM_ID, roleCode: "site_engineer" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    // No session needed — we're just testing the role guard at service level
    // Use the PM's session but with site_engineer token — middleware checks DB user's roleCode
    // Actually the middleware fetches from DB, so we need a real site_engineer user.
    // Use a direct approach: check that finance.service rejects non-allowed roles.
    // We simulate by calling the service directly.
    const financeService = require(path.resolve(__dirname, "../src/modules/projects/finance.service"));
    let threw = false;
    try {
        await financeService.getBudgetVsActual(
            { roleCode: "site_engineer", companyId: COMPANY_ID, isSuperAdmin: false },
            { projectId: PROJECT_ID, costCodeFilter: null, from: null, to: null }
        );
    } catch (err) {
        if (err.statusCode === 403) threw = true;
        else throw err;
    }
    if (!threw) fail("Expected 403 for site_engineer role");
    log("403 Forbidden correctly thrown for site_engineer");
}

async function test3_UnknownProject() {
    console.log("\n🧪  TEST 3 — Unknown projectId → 404");
    const res = await request("GET", `/projects/00000000-0000-0000-0000-000000000000/finance/budget-vs-actual`, null, pmToken);
    if (res.status !== 404) fail(`Expected 404, got ${res.status}`, res.body);
    log("404 correctly returned for non-existent project");
}

async function test4_OverspentStatus() {
    console.log("\n🧪  TEST 4 — actuals > budget → OVERSPENT");
    // Create an approved expense > budget
    const expense = await prisma.expense.create({
        data: {
            expense_number: `TEST-OVERSPENT-${Date.now()}`,
            company_id: COMPANY_ID,
            project_id: PROJECT_ID,
            cost_code_id: created.ccId,
            amount: 120000, // > 100000 budget
            status: "approved",
            description: "Test overspent expense",
            created_by: PM_ID,
        },
    });
    created.expenseId = expense.id;

    const res = await request("GET", `/projects/${PROJECT_ID}/finance/budget-vs-actual`, null, pmToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const item = res.body.data.items.find((i) => i.costCode.includes("TEST-WBS-BVA"));
    if (!item) fail("Could not find test cost-code row in response");
    if (item.status !== "OVERSPENT") fail(`Expected OVERSPENT, got ${item.status}`, item);
    log(`OVERSPENT: actualSpend=${item.actualSpend} > budgetAmount=${item.budgetAmount}`);

    // Cleanup expense
    await prisma.expense.delete({ where: { id: expense.id } });
    created.expenseId = null;
}

async function test5_AtRiskStatus() {
    console.log("\n🧪  TEST 5 — actuals > 85% budget → AT_RISK");
    const expense = await prisma.expense.create({
        data: {
            expense_number: `TEST-ATRISK-${Date.now()}`,
            company_id: COMPANY_ID,
            project_id: PROJECT_ID,
            cost_code_id: created.ccId,
            amount: 90000, // 90% of 100000 = AT_RISK
            status: "approved",
            description: "Test at-risk expense",
            created_by: PM_ID,
        },
    });
    created.expenseId = expense.id;

    const res = await request("GET", `/projects/${PROJECT_ID}/finance/budget-vs-actual`, null, pmToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const item = res.body.data.items.find((i) => i.costCode.includes("TEST-WBS-BVA"));
    if (!item) fail("Could not find test cost-code row");
    if (item.status !== "AT_RISK") fail(`Expected AT_RISK (90% used), got ${item.status}`, item);
    log(`AT_RISK: ${item.variancePercent}% used, status=${item.status}`);

    await prisma.expense.delete({ where: { id: expense.id } });
    created.expenseId = null;
}

async function test6_DateRangeFilter() {
    console.log("\n🧪  TEST 6 — date range filter excludes out-of-range actuals");
    const pastDate = "2020-01-01T00:00:00.000Z";
    const expense = await prisma.expense.create({
        data: {
            expense_number: `TEST-DATEFILTER-${Date.now()}`,
            company_id: COMPANY_ID,
            project_id: PROJECT_ID,
            cost_code_id: created.ccId,
            amount: 50000,
            status: "approved",
            description: "Test date filter expense",
            created_by: PM_ID,
            created_at: new Date(pastDate), // old date
        },
    });
    created.expenseId = expense.id;

    // Filter from current year — should exclude the 2020 expense
    const from = "2025-01-01";
    const res = await request("GET", `/projects/${PROJECT_ID}/finance/budget-vs-actual?from=${from}`, null, pmToken);
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    const item = res.body.data.items.find((i) => i.costCode.includes("TEST-WBS-BVA"));
    if (!item) fail("Could not find test cost-code row");
    if (item.actualSpend !== 0) fail(`Expected actualSpend=0 (filtered out), got ${item.actualSpend}`, item);
    log(`Date filter works: expense from 2020 excluded when from=${from}, actualSpend=${item.actualSpend}`);

    await prisma.expense.delete({ where: { id: expense.id } });
    created.expenseId = null;
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
async function teardown() {
    console.log("\n🗑️   TEARDOWN");
    if (created.expenseId) await prisma.expense.delete({ where: { id: created.expenseId } }).catch(() => {});
    if (created.ccId)      await prisma.costCode.delete({ where: { id: created.ccId } }).catch(() => {});
    if (created.wbsId)     await prisma.wBS.delete({ where: { id: created.wbsId } }).catch(() => {});
    if (created.sessionPM)  await prisma.userSession.delete({ where: { id: created.sessionPM } }).catch(() => {});
    if (created.sessionEng) await prisma.userSession.delete({ where: { id: created.sessionEng } }).catch(() => {});
    log("Cleaned up test data");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log("=".repeat(60));
    console.log("  Budget vs Actual API — Integration Tests");
    console.log("=".repeat(60));
    let exitCode = 0;
    try {
        await setup();
        await test1_PMCanFetch();
        await test2_EngineerForbidden();
        await test3_UnknownProject();
        await test4_OverspentStatus();
        await test5_AtRiskStatus();
        await test6_DateRangeFilter();
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
