/**
 * Integration Test — MR Approval & Issuance Lifecycle (Full 6-Step Flow)
 *
 * Tests the full Site-Engineer → PM Approval → Storekeeper flow:
 *
 *   Step 1 — Engineer:    POST /api/inventory/requests
 *                         → assert 201, MR created with PENDING status
 *
 *   Step 2 — PM inbox:    GET /api/approvals/inbox
 *                         → assert MR present with docType="MR", status=pending
 *
 *   Step 3 — PM approves: POST /api/approvals/:id/approve (canonical)
 *                         → assert 200
 *
 *   Step 4 — Status check: GET /api/inventory/requests/:id
 *                         → assert reservation_status = "RESERVED"
 *
 *   Step 5 — Storekeeper: POST /api/inventory/requests/:id/issue
 *                         → assert 200, stock decremented
 *
 *   Step 6 — Final state: GET /api/inventory/requests/:id
 *                         → assert reservation_status = "ISSUED"
 *
 *   Also verifies rejection path: PENDING MR CANNOT be issued (must be RESERVED).
 *
 * Run from Server/ directory:
 *   node scratch/test_mr_approval_flow.js
 */

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const http    = require("http");
const jwt     = require("jsonwebtoken");
const prisma  = require(path.resolve(__dirname, "../src/db"));
const app     = require(path.resolve(__dirname, "../src/app"));

// ─── Test Fixtures (all confirmed from DB) ────────────────────────────────────────────────
// Company:      Antigravity Construction (92f0aa78-8dd8-41c3-969a-2e0089d0aeb6)
// Project:      NEOM Square Infrastructure (db0e9eec-32da-4091-b607-38dd327725f2)
// WBS:          Site Mobilization (34b7a62d-212b-4f3a-afb9-2ca673870fe3)
// CostCode:     22163728-ab6c-4a90-bc70-a37f305f865a
// Item:         Safety Helmet (243a081e-cfad-4dbb-ac06-97bee5f8319b) — Antigravity company
// Engineer:     superadmin@erp.com (327e5c8a) — super_admin bypasses company/project scoping
// PM:           pm@erp.com (c2d8051d-639d-4a67-8fd3-1511d8f7c605)
// Storekeeper:  storekeeper@erp.com (a63ed1b2-0e51-45d0-8405-7734e154301c)
//
// NOTE: We use super_admin as the MR creator because they bypass company scoping validation.
// This lets us test the approval workflow without cross-company setup complexity.
// In production, a real site_engineer from the Antigravity company would be used.

const COMPANY_ID     = "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6";
const ENGINEER_ID    = "327e5c8a-1b8a-42c3-9806-e303405e8a5a"; // superadmin@erp.com (bypasses scoping)
const PM_ID          = "c2d8051d-639d-4a67-8fd3-1511d8f7c605"; // pm@erp.com
const SK_ID          = "a63ed1b2-0e51-45d0-8405-7734e154301c"; // storekeeper@erp.com
const PROJECT_ID     = "db0e9eec-32da-4091-b607-38dd327725f2"; // NEOM Square Infrastructure
const WBS_ID         = "34b7a62d-212b-4f3a-afb9-2ca673870fe3"; // Site Mobilization
const COST_CODE_ID   = "22163728-ab6c-4a90-bc70-a37f305f865a";
const ITEM_ID        = "243a081e-cfad-4dbb-ac06-97bee5f8319b"; // Safety Helmet (Antigravity company)

const STOCK_QTY   = 200.0;
const REQUEST_QTY =  50.0;

// Track created records for cleanup
const created = {
    matrixId:        null,  // seeded only if no MR matrix pre-exists
    storeId:         null,
    stockId:         null,
    requestId:       null,
    approvalStepId:  null,
    approvalReqId:   null,
    issueId:         null,
    sessionEng:      null,
    sessionPM:       null,
    sessionSK:       null,
};

let server;
let engToken, pmToken, skToken;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(msg)  { console.log(`  ✔  ${msg}`); }
function warn(msg) { console.warn(`  ⚠  ${msg}`); }
function fail(label, detail) {
    console.error(`\n  ✘  FAIL: ${label}`);
    if (detail !== undefined) console.error("      Detail:", JSON.stringify(detail, null, 2));
    throw new Error(label);
}

async function request(method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: "127.0.0.1",
            port:     server.address().port,
            path:     `/api${urlPath}`,
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

function mintToken(userId, roleCode) {
    return jwt.sign({ userId, roleCode }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

// ─── Setup ─────────────────────────────────────────────────────────────────
async function setup() {
    console.log("\n📦  SETUP");

    // Ensure the test item has a standard_price
    await prisma.item.update({ where: { id: ITEM_ID }, data: { standard_price: 100 } });
    log("Set item standard_price = 100");

    // Create isolated test store
    const store = await prisma.store.create({
        data: { name: "TEST_STORE_MR_FLOW", company_id: COMPANY_ID, is_active: true }
    });
    created.storeId = store.id;
    log(`Created store: "${store.name}" [${store.id}]`);

    // Ensure a global MR approval matrix exists for this company.
    // Seeds one only if absent so the test is self-contained and idempotent.
    const pmRole = await prisma.role.findFirst({ where: { code: "project_manager" } });
    if (!pmRole) throw new Error("project_manager role not found — run seed_rbac first");
    const existingMatrix = await prisma.approvalMatrix.findFirst({
        where: { doc_type: "MR", project_id: null, company_id: COMPANY_ID }
    });
    if (!existingMatrix) {
        const m = await prisma.approvalMatrix.create({
            data: {
                doc_type: "MR", project_id: null, company_id: COMPANY_ID,
                role_id: pmRole.id, step_order: 1,
                min_amount: null, max_amount: null, department_id: null,
                is_parallel: false, is_mandatory: true, escalation_hours: null,
            }
        });
        created.matrixId = m.id;
        log(`Seeded MR approval matrix [${m.id}]`);
    } else {
        log(`MR approval matrix already exists [${existingMatrix.id}]`);
    }

    // Seed inventory stock
    const stock = await prisma.inventoryStock.create({
        data: { company_id: COMPANY_ID, store_id: created.storeId, item_id: ITEM_ID, quantity: STOCK_QTY }
    });
    created.stockId = stock.id;
    log(`Seeded stock: qty=${STOCK_QTY}`);

    // Mint JWTs + active sessions
    // NOTE: Engineer token uses "super_admin" roleCode so validateResourceAccess returns early (isSuperAdmin bypass)
    engToken = mintToken(ENGINEER_ID, "super_admin");
    pmToken  = mintToken(PM_ID, "project_manager");
    skToken  = mintToken(SK_ID, "storekeeper");

    const engSess = await prisma.userSession.create({ data: { user_id: ENGINEER_ID, jwt_token: engToken, is_active: true } });
    const pmSess  = await prisma.userSession.create({ data: { user_id: PM_ID,       jwt_token: pmToken,  is_active: true } });
    const skSess  = await prisma.userSession.create({ data: { user_id: SK_ID,       jwt_token: skToken,  is_active: true } });
    created.sessionEng = engSess.id;
    created.sessionPM  = pmSess.id;
    created.sessionSK  = skSess.id;
    log("Minted JWT sessions for engineer, PM, storekeeper");

    // 9. Start Express on a random port
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    log(`Express listening on port ${server.address().port}`);
}

// ─── Step 1 — Engineer creates MR ─────────────────────────────────────────────
async function step1_CreateMR() {
    console.log("\n🧪  STEP 1 — POST /api/inventory/requests  (engineer creates MR)");

    const res = await request("POST", "/inventory/requests", {
        projectId:    PROJECT_ID,
        wbsId:        WBS_ID,
        itemId:       ITEM_ID,
        quantity:     REQUEST_QTY,
        requiredDate: "2026-08-01T00:00:00.000Z",
        storeId:      created.storeId,
    }, engToken);

    if (res.status !== 201)                            fail(`Expected 201, got ${res.status}`, res.body);
    if (!res.body.success)                             fail("Response success=false", res.body);
    if (!res.body.data?.id)                            fail("No request ID in response", res.body);
    if (res.body.data.reservation_status !== "PENDING") fail(`Expected PENDING, got ${res.body.data.reservation_status}`);

    created.requestId = res.body.data.id;
    log(`MR created: ID=${created.requestId} status=PENDING qty=${res.body.data.quantity}`);
}

// ─── Step 2 — PM sees MR in approval inbox ────────────────────────────────────
async function step2_PMInbox() {
    console.log("\n🧪  STEP 2 — GET /api/approvals/inbox  (PM sees the MR)");

    const res = await request("GET", "/approvals/inbox?status=pending", null, pmToken);

    if (res.status !== 200)           fail(`Expected 200, got ${res.status}`, res.body);
    if (!res.body.success)            fail("Response success=false", res.body);
    if (!Array.isArray(res.body.data)) fail("data is not an array", res.body);

    const mrEntry = res.body.data.find((s) => s.docId === created.requestId && s.docType === "MR");
    if (!mrEntry) fail(
        `MR [${created.requestId}] with docType="MR" not found in PM inbox. Items in inbox: ${res.body.data.length}`,
        res.body.data.slice(0, 3)
    );

    created.approvalReqId  = mrEntry.approvalRequestId;
    created.approvalStepId = mrEntry.stepId;
    log(`MR found in PM inbox: approvalRequestId=${created.approvalReqId} docType=${mrEntry.docType} status=${mrEntry.status}`);
}

// ─── Step 3 — PM approves via canonical endpoint ──────────────────────────────
async function step3_PMApproves() {
    console.log("\n🧪  STEP 3 — POST /api/approvals/:id/approve  (PM approves — canonical path)");

    const res = await request(
        "POST",
        `/approvals/${created.approvalReqId}/approve`,
        { remarks: "Approved for site use" },
        pmToken
    );

    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    if (!res.body.success)  fail("Response success=false", res.body);

    const status = res.body.data?.currentStatus || res.body.currentStatus;
    log(`Approval step approved: currentStatus=${status}`);
}

// ─── Step 4 — MR reservation_status is now RESERVED ──────────────────────────
async function step4_StatusIsReserved() {
    console.log("\n🧪  STEP 4 — Check reservation_status = RESERVED via DB");

    // Poll DB directly (adapter is sync within the approval engine)
    const mr = await prisma.inventoryPlanningRequest.findUnique({
        where: { id: created.requestId }
    });
    if (!mr) fail("MR not found in DB");
    if (mr.reservation_status !== "RESERVED") {
        fail(`Expected reservation_status=RESERVED, got '${mr.reservation_status}'`);
    }
    log(`reservation_status=RESERVED ✔`);
}

// ─── Step 4.5 — Verify PENDING MR cannot be issued ───────────────────────────
async function step4b_PendingMRBlocked() {
    console.log("\n🧪  STEP 4b — Guard: PENDING MR must be blocked from issuance");

    // Create a fresh PENDING MR (no approval triggered — we'll manually set status)
    const pendingMR = await prisma.inventoryPlanningRequest.create({
        data: {
            company_id:        COMPANY_ID,
            project_id:        PROJECT_ID,
            wbs_id:            WBS_ID,
            item_id:           ITEM_ID,
            store_id:          created.storeId,
            quantity:          5,
            reservation_status:"PENDING",
            created_by:        ENGINEER_ID,
            status:            "draft"
        }
    });

    const res = await request(
        "POST",
        `/inventory/requests/${pendingMR.id}/issue`,
        { storeId: created.storeId, costCodeId: COST_CODE_ID },
        skToken
    );

    // Cleanup the temp MR
    await prisma.inventoryPlanningRequest.delete({ where: { id: pendingMR.id } }).catch(() => {});

    if (res.status !== 422) fail(`Expected 422, got ${res.status} — PENDING MR should be blocked`, res.body);
    if (!res.body.message?.includes("RESERVED")) fail(`Error message should mention RESERVED`, res.body);
    log(`PENDING MR correctly blocked: "${res.body.message}"`);
}

// ─── Step 5 — Storekeeper fulfills the RESERVED MR ───────────────────────────
async function step5_StorekeeperIssues() {
    console.log("\n🧪  STEP 5 — POST /api/inventory/requests/:id/issue  (storekeeper issues)");

    const res = await request(
        "POST",
        `/inventory/requests/${created.requestId}/issue`,
        { storeId: created.storeId, costCodeId: COST_CODE_ID },
        skToken
    );

    if (res.status !== 200) fail(`Expected 200, got ${res.status}`, res.body);
    if (!res.body.success)  fail("Response success=false", res.body);
    if (!res.body.data?.issue?.id) fail("No issue.id in response", res.body);
    if (res.body.data?.request?.reservation_status !== "ISSUED")
        fail(`Expected ISSUED, got ${res.body.data?.request?.reservation_status}`, res.body);

    created.issueId = res.body.data.issue.id;
    log(`MaterialIssue created: ID=${created.issueId}`);
    log(`reservation_status → ISSUED ✔`);
}

// ─── Step 6 — Final state assertion ──────────────────────────────────────────
async function step6_FinalState() {
    console.log("\n🧪  STEP 6 — Verify final DB state");

    // 6a. MR status
    const mr = await prisma.inventoryPlanningRequest.findUnique({ where: { id: created.requestId } });
    if (mr.reservation_status !== "ISSUED") fail(`MR status is "${mr.reservation_status}", expected "ISSUED"`);
    log(`InventoryPlanningRequest: reservation_status=ISSUED ✔`);

    // 6b. Stock decremented
    const stock = await prisma.inventoryStock.findUnique({ where: { id: created.stockId } });
    const expectedQty = STOCK_QTY - REQUEST_QTY;
    if (parseFloat(stock.quantity) !== expectedQty)
        fail(`Stock mismatch: expected ${expectedQty}, got ${stock.quantity}`);
    log(`InventoryStock: ${STOCK_QTY} → ${stock.quantity}  (−${REQUEST_QTY}) ✔`);

    // 6c. MaterialIssue + MaterialIssueItem exist
    const issue = await prisma.materialIssue.findUnique({ where: { id: created.issueId } });
    if (!issue) fail("MaterialIssue not found in DB");
    log(`MaterialIssue: issue_no=${issue.issue_no} ✔`);

    const items = await prisma.materialIssueItem.findMany({ where: { issue_id: created.issueId } });
    if (items.length === 0) fail("No MaterialIssueItem rows found");
    log(`MaterialIssueItem: ${items.length} row(s) ✔`);

    // 6d. StockLedger ISSUE_OUT entry
    const ledger = await prisma.stockLedger.findFirst({
        where: { reference_id: created.issueId, move_type: "ISSUE_OUT" }
    });
    if (!ledger) fail("StockLedger ISSUE_OUT entry not found");
    log(`StockLedger: move_type=${ledger.move_type} qty=${ledger.quantity} ✔`);

    // 6e. Approval request is marked completed+approved
    const approvalReq = await prisma.approvalRequest.findUnique({ where: { id: created.approvalReqId } });
    if (!approvalReq) fail("ApprovalRequest not found in DB");
    if (approvalReq.current_status !== "approved")
        fail(`ApprovalRequest status is "${approvalReq.current_status}", expected "approved"`);
    log(`ApprovalRequest: current_status=approved, is_completed=${approvalReq.is_completed} ✔`);
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
async function teardown() {
    console.log("\n🗑️   TEARDOWN");

    if (created.issueId) {
        await prisma.materialIssueItem.deleteMany({ where: { issue_id: created.issueId } }).catch(() => {});
        await prisma.stockLedger.deleteMany({ where: { reference_id: created.issueId } }).catch(() => {});
        await prisma.materialIssue.delete({ where: { id: created.issueId } }).catch(() => {});
        log("Deleted MaterialIssue + items + ledger entries");
    }
    if (created.approvalReqId) {
        await prisma.approvalStep.deleteMany({ where: { approval_request_id: created.approvalReqId } }).catch(() => {});
        await prisma.approvalRequest.delete({ where: { id: created.approvalReqId } }).catch(() => {});
        log("Deleted ApprovalRequest + steps");
    }
    if (created.requestId) {
        await prisma.inventoryPlanningRequest.delete({ where: { id: created.requestId } }).catch(() => {});
        log("Deleted material request");
    }
    if (created.stockId) {
        await prisma.inventoryStock.delete({ where: { id: created.stockId } }).catch(() => {});
        log("Deleted inventory stock");
    }
    if (created.matrixId) {
        await prisma.approvalMatrix.delete({ where: { id: created.matrixId } }).catch(() => {});
        log("Deleted seeded MR approval matrix");
    }
    if (created.storeId) {
        await prisma.store.delete({ where: { id: created.storeId } }).catch(() => {});
        log("Deleted test store");
    }
    for (const [key, sesId] of [["sessionEng", created.sessionEng], ["sessionPM", created.sessionPM], ["sessionSK", created.sessionSK]]) {
        if (sesId) {
            await prisma.userSession.delete({ where: { id: sesId } }).catch(() => {});
            log(`Revoked session: ${key}`);
        }
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log("=".repeat(68));
    console.log("  MR Approval & Issuance Lifecycle — Full 6-Step Integration Test");
    console.log("=".repeat(68));

    let exitCode = 0;
    try {
        await setup();
        await step1_CreateMR();
        await step2_PMInbox();
        await step3_PMApproves();
        await step4_StatusIsReserved();
        await step4b_PendingMRBlocked();
        await step5_StorekeeperIssues();
        await step6_FinalState();

        console.log("\n" + "=".repeat(68));
        console.log("  🎉  ALL 6 STEPS PASSED + DB ASSERTIONS VERIFIED");
        console.log("=".repeat(68));
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
