/**
 * Integration Verification Script — Material Requests API (Week 12)
 *
 * Tests the full Site-Engineer → Storekeeper flow:
 *   1. Setup  — create test store, seed stock, mint JWT sessions
 *   2. POST   /api/inventory/requests        (site_engineer creates request)
 *   3. GET    /api/inventory/requests        (list with filters)
 *   4. PUT    /api/inventory/requests/:id/status   (update status → RESERVED)
 *   5. POST   /api/inventory/requests/:id/issue    (storekeeper fulfills)
 *   6. Assert — stock decremented, MaterialIssue & StockLedger created
 *   7. Teardown — remove all created test records
 *
 * Run from Server/ directory:
 *   node scratch/test_material_requests.js
 */

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const http    = require("http");
const jwt     = require("jsonwebtoken");
const prisma  = require(path.resolve(__dirname, "../src/db"));
const app     = require(path.resolve(__dirname, "../src/app"));

// ─── Test Fixtures (from DB inspection) ──────────────────────────────────────
const COMPANY_ID     = "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6";
const PROJECT_ID     = "db0e9eec-32da-4091-b607-38dd327725f2"; // NEOM Square Infrastructure
const WBS_ID         = "34b7a62d-212b-4f3a-afb9-2ca673870fe3"; // Site Mobilization
const COST_CODE_ID   = "22163728-ab6c-4a90-bc70-a37f305f865a";
const ITEM_ID        = "60e3179d-48b4-4395-987a-a07ec189fed2"; // Deformed Steel Bar 12mm
const ENGINEER_ID    = "73fb4499-9646-4bee-9090-889985455886"; // engineer@erp.com
const STOREKEEPER_ID = "a63ed1b2-0e51-45d0-8405-7734e154301c"; // storekeeper@erp.com

const STOCK_QTY   = 200.0;
const REQUEST_QTY =  50.0;

// Track created records for cleanup
const created = {
    storeId:    null,
    sessionEng: null,
    sessionSK:  null,
    requestId:  null,
    issueId:    null,
    stockId:    null,
};

let server;
let engToken, skToken;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(msg)  { console.log(`  ✔  ${msg}`); }
function warn(msg) { console.warn(`  ⚠  ${msg}`); }
function fail(label, detail) {
    console.error(`\n  ✘  FAIL: ${label}`);
    if (detail !== undefined) console.error("      Detail:", JSON.stringify(detail, null, 2));
    throw new Error(label);
}

/** Fire an HTTP request against the live test server */
async function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: "127.0.0.1",
            port:     server.address().port,
            path:     `/api${path}`,
            method,
            headers: {
                "Content-Type": "application/json",
                ...(token   ? { Authorization: `Bearer ${token}` } : {}),
                ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            },
        };

        const req = http.request(opts, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
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

    // 1. Create isolated test store
    const store = await prisma.store.create({
        data: { name: "TEST_STORE_MR_VERIFY", company_id: COMPANY_ID },
    });
    created.storeId = store.id;
    log(`Created store: "${store.name}" [${store.id}]`);

    // 2. Ensure item has a standard_price so cost computation works
    await prisma.item.update({ where: { id: ITEM_ID }, data: { standard_price: 100 } });
    log("Set item standard_price = 100");

    // 3. Seed inventory stock
    const stock = await prisma.inventoryStock.create({
        data: {
            company_id: COMPANY_ID,
            store_id:   created.storeId,
            item_id:    ITEM_ID,
            quantity:   STOCK_QTY,
        },
    });
    created.stockId = stock.id;
    log(`Seeded stock: qty=${STOCK_QTY} for item [${ITEM_ID}]`);

    // 4. Mint site_engineer JWT + active session
    engToken = jwt.sign({ userId: ENGINEER_ID, roleCode: "site_engineer" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const engSess = await prisma.userSession.create({
        data: { user_id: ENGINEER_ID, jwt_token: engToken, is_active: true },
    });
    created.sessionEng = engSess.id;
    log("Minted site_engineer JWT session");

    // 5. Mint storekeeper JWT + active session
    skToken = jwt.sign({ userId: STOREKEEPER_ID, roleCode: "storekeeper" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const skSess = await prisma.userSession.create({
        data: { user_id: STOREKEEPER_ID, jwt_token: skToken, is_active: true },
    });
    created.sessionSK = skSess.id;
    log("Minted storekeeper JWT session");

    // 6. Start Express on a random available port
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    log(`Express listening on port ${server.address().port}`);
}

// ─── Test Cases ───────────────────────────────────────────────────────────────
async function test1_CreateRequest() {
    console.log("\n🧪  TEST 1 — POST /api/inventory/requests  (site engineer creates request)");

    const res = await request("POST", "/inventory/requests", {
        projectId:    PROJECT_ID,
        wbsId:        WBS_ID,
        itemId:       ITEM_ID,
        quantity:     REQUEST_QTY,
        requiredDate: "2026-07-01T00:00:00.000Z",
        storeId:      created.storeId,
    }, engToken);

    if (res.status !== 201)                        fail(`Expected 201, got ${res.status}`, res.body);
    if (!res.body.success)                         fail("Response success=false", res.body);
    if (!res.body.data?.id)                        fail("No request ID in response", res.body);
    if (res.body.data.reservation_status !== "PENDING") fail(`Expected PENDING, got ${res.body.data.reservation_status}`);
    if (parseFloat(res.body.data.quantity) !== REQUEST_QTY) fail(`Qty mismatch: ${res.body.data.quantity}`);

    created.requestId = res.body.data.id;
    log(`Created request [${created.requestId}] status=PENDING qty=${res.body.data.quantity}`);
}

async function test2_ListRequests() {
    console.log("\n🧪  TEST 2 — GET /api/inventory/requests  (list with project + status filter)");

    const res = await request(
        "GET",
        `/inventory/requests?projectId=${PROJECT_ID}&reservationStatus=PENDING`,
        null,
        engToken
    );

    if (res.status !== 200)           fail(`Expected 200, got ${res.status}`, res.body);
    if (!res.body.success)            fail("Response success=false", res.body);
    if (!Array.isArray(res.body.data)) fail("data is not an array", res.body);

    const found = res.body.data.find((r) => r.id === created.requestId);
    if (!found) fail("Created request not found in listing");

    log(`Listed ${res.body.data.length} request(s); found created request ✔`);
    log(`Pagination: total=${res.body.pagination?.total} page=${res.body.pagination?.page}`);
}

async function test3_UpdateStatus() {
    console.log("\n🧪  TEST 3 — PUT /api/inventory/requests/:id/status  (update → RESERVED)");

    const res = await request(
        "PUT",
        `/inventory/requests/${created.requestId}/status`,
        { status: "RESERVED" },
        skToken
    );

    if (res.status !== 200)                              fail(`Expected 200, got ${res.status}`, res.body);
    if (!res.body.success)                               fail("Response success=false", res.body);
    if (res.body.data.reservation_status !== "RESERVED") fail(`Expected RESERVED, got ${res.body.data.reservation_status}`);

    log(`Status updated: PENDING → RESERVED ✔`);
}

async function test4_FulfillRequest() {
    console.log("\n🧪  TEST 4 — POST /api/inventory/requests/:id/issue  (storekeeper fulfills)");

    const res = await request(
        "POST",
        `/inventory/requests/${created.requestId}/issue`,
        { storeId: created.storeId, costCodeId: COST_CODE_ID },
        skToken
    );

    if (res.status !== 200)                                  fail(`Expected 200, got ${res.status}`, res.body);
    if (!res.body.success)                                   fail("Response success=false", res.body);
    if (!res.body.data?.issue?.id)                           fail("No issue.id in response", res.body);
    if (res.body.data?.request?.reservation_status !== "ISSUED") fail(`Expected ISSUED, got ${res.body.data?.request?.reservation_status}`);

    created.issueId = res.body.data.issue.id;
    log(`Issue created [${created.issueId}]`);
    log(`Request status → ISSUED ✔`);
}

// ─── DB Assertions ────────────────────────────────────────────────────────────
async function verifyDbSideEffects() {
    console.log("\n🔍  VERIFY — Database side-effects");

    // 1. Stock decremented
    const stock = await prisma.inventoryStock.findUnique({ where: { id: created.stockId } });
    const expectedQty = STOCK_QTY - REQUEST_QTY;
    if (parseFloat(stock.quantity) !== expectedQty)
        fail(`Stock mismatch: expected ${expectedQty}, got ${stock.quantity}`);
    log(`InventoryStock: ${STOCK_QTY} → ${stock.quantity}  (−${REQUEST_QTY}) ✔`);

    // 2. MaterialIssue record exists
    const issue = await prisma.materialIssue.findUnique({ where: { id: created.issueId } });
    if (!issue) fail("MaterialIssue not found in DB");
    log(`MaterialIssue: issue_no=${issue.issue_no} ✔`);

    // 3. MaterialIssueItem
    const issueItems = await prisma.materialIssueItem.findMany({ where: { issue_id: created.issueId } });
    if (issueItems.length === 0) fail("No MaterialIssueItem rows found");
    log(`MaterialIssueItem: ${issueItems.length} row(s), qty=${issueItems[0].quantity} ✔`);

    // 4. StockLedger ISSUE_OUT entry
    const ledger = await prisma.stockLedger.findFirst({
        where: { reference_id: created.issueId, move_type: "ISSUE_OUT" },
    });
    if (!ledger) fail("StockLedger ISSUE_OUT entry not found");
    log(`StockLedger: move_type=${ledger.move_type} qty=${ledger.quantity} ✔`);

    // 5. Request reservation_status = ISSUED in DB
    const req = await prisma.inventoryPlanningRequest.findUnique({ where: { id: created.requestId } });
    if (req.reservation_status !== "ISSUED")
        fail(`DB request status is "${req.reservation_status}", expected "ISSUED"`);
    log(`InventoryPlanningRequest: reservation_status=ISSUED ✔`);
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
async function teardown() {
    console.log("\n🗑️   TEARDOWN (removing test data)");

    if (created.issueId) {
        await prisma.materialIssueItem.deleteMany({ where: { issue_id: created.issueId } }).catch(() => {});
        await prisma.stockLedger.deleteMany({ where: { reference_id: created.issueId } }).catch(() => {});
        await prisma.materialIssue.delete({ where: { id: created.issueId } }).catch(() => {});
        log("Deleted MaterialIssue + items + ledger entries");
    }
    if (created.requestId) {
        await prisma.inventoryPlanningRequest.delete({ where: { id: created.requestId } }).catch(() => {});
        log("Deleted material request");
    }
    if (created.stockId) {
        await prisma.inventoryStock.delete({ where: { id: created.stockId } }).catch(() => {});
        log("Deleted inventory stock");
    }
    if (created.storeId) {
        await prisma.store.delete({ where: { id: created.storeId } }).catch(() => {});
        log("Deleted test store");
    }
    if (created.sessionEng) {
        await prisma.userSession.delete({ where: { id: created.sessionEng } }).catch(() => {});
        log("Revoked engineer session");
    }
    if (created.sessionSK) {
        await prisma.userSession.delete({ where: { id: created.sessionSK } }).catch(() => {});
        log("Revoked storekeeper session");
    }

    // Reset item price
    await prisma.item.update({ where: { id: ITEM_ID }, data: { standard_price: 0 } }).catch(() => {});
    log("Reset item standard_price → 0");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log("=".repeat(62));
    console.log("  Material Requests API — Integration Verification (Week 12)");
    console.log("=".repeat(62));

    let exitCode = 0;
    try {
        await setup();
        await test1_CreateRequest();
        await test2_ListRequests();
        await test3_UpdateStatus();
        await test4_FulfillRequest();
        await verifyDbSideEffects();

        console.log("\n" + "=".repeat(62));
        console.log("  🎉  ALL 4 TESTS PASSED + DB ASSERTIONS VERIFIED");
        console.log("=".repeat(62));
    } catch (err) {
        console.error(`\n💥  Test suite failed: ${err.message}`);
        exitCode = 1;
    } finally {
        try { await teardown(); } catch (e) { warn(`Teardown error: ${e.message}`); }
        if (server) server.close();
        await prisma.$disconnect();
        console.log("\n✅  Cleanup complete. Exiting.\n");
        process.exit(exitCode);
    }
})();
