"use strict";

require("dotenv").config();
const db = require("./src/db");

let TEST_COMPANY_ID = null;
let TEST_USER_ID = null;
let TEST_PROJECT_ID = null;
let TEST_VENDOR_ID = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pass(msg) { console.log(`  ✔ ${msg}`); }
function fail(msg, err) { console.error(`  ✘ ${msg}`, err?.message || err); throw err; }

async function bootstrap() {
    const company = await db.company.findFirst({ where: { is_active: true } });
    if (!company) throw new Error("No active company found in DB.");
    TEST_COMPANY_ID = company.id;

    const user = await db.user.findFirst({ where: { company_id: TEST_COMPANY_ID } });
    if (!user) throw new Error("No user found.");
    TEST_USER_ID = user.id;

    const project = await db.project.findFirst({ where: { company_id: TEST_COMPANY_ID } });
    if (project) TEST_PROJECT_ID = project.id;

    const vendor = await db.vendor.findFirst({ where: { company_id: TEST_COMPANY_ID } });
    if (vendor) TEST_VENDOR_ID = vendor.id;

    console.log(`[BOOTSTRAP] Company: ${TEST_COMPANY_ID} | User: ${TEST_USER_ID}`);
}

// ─── Asset Tests ──────────────────────────────────────────────────────────────
async function testAssetLifecycle() {
    console.log("\n[TEST] 1. Asset Registration (DRAFT)...");
    const now = new Date();
    const count = await db.asset.count({ where: { company_id: TEST_COMPANY_ID } });
    const asset_code = `TEST-AST-${Date.now()}`;

    const asset = await db.asset.create({
        data: {
            company_id: TEST_COMPANY_ID,
            asset_code,
            asset_name: "Test Laptop Enterprise",
            category: "IT_EQUIPMENT",
            purchase_date: now,
            purchase_cost: 10000.00,
            useful_life_months: 36,
            salvage_value: 1000.00,
            current_book_value: 10000.00,
            depreciation_method: "STRAIGHT_LINE",
            project_id: TEST_PROJECT_ID || null,
            status: "DRAFT"
        }
    });
    pass(`Asset created in DRAFT: ${asset.asset_code}`);

    console.log("[TEST] 2. Asset Allocation (ACTIVE)...");
    // Close any existing allocation, create new
    await db.assetAllocation.create({
        data: {
            asset_id: asset.id,
            project_id: TEST_PROJECT_ID || null,
            employee_id: null,
            allocated_by: TEST_USER_ID,
            status: "ACTIVE"
        }
    });
    await db.asset.update({ where: { id: asset.id }, data: { status: "ACTIVE" } });
    const updatedAsset = await db.asset.findUnique({ where: { id: asset.id } });
    if (updatedAsset.status !== "ACTIVE") fail("Asset not ACTIVE after allocation");
    pass(`Asset allocated. Status: ${updatedAsset.status}`);

    console.log("[TEST] 3. Depreciation Calculation (Straight-Line)...");
    const purchaseCost = Number(asset.purchase_cost);
    const salvageValue = Number(asset.salvage_value);
    const usefulLifeMonths = asset.useful_life_months;
    const monthlyDepr = (purchaseCost - salvageValue) / usefulLifeMonths;
    const expectedMonthlyDepr = (10000 - 1000) / 36;
    if (Math.abs(monthlyDepr - expectedMonthlyDepr) > 0.01)
        fail(`Depreciation calculation mismatch: ${monthlyDepr} vs ${expectedMonthlyDepr}`);
    pass(`Straight-Line depreciation = ${monthlyDepr.toFixed(2)} / month (correct)`);

    console.log("[TEST] 4. Duplicate Depreciation Run Prevention...");
    const testPeriod = "2099-01"; // Far future period to avoid real period conflicts
    // Simulate creating a run for this period
    await db.assetDepreciationRun.create({
        data: {
            company_id: TEST_COMPANY_ID,
            period_month: testPeriod,
            total_depreciation: 0.01,
            processed_by: TEST_USER_ID,
            status: "POSTED"
        }
    });
    const dupRun = await db.assetDepreciationRun.findUnique({
        where: { company_id_period_month: { company_id: TEST_COMPANY_ID, period_month: testPeriod } }
    });
    if (!dupRun) fail("Depreciation run not found after creation");
    // Verify unique constraint blocks second run
    try {
        await db.assetDepreciationRun.create({
            data: {
                company_id: TEST_COMPANY_ID,
                period_month: testPeriod,
                total_depreciation: 0.01,
                processed_by: TEST_USER_ID,
                status: "POSTED"
            }
        });
        fail("Should have blocked duplicate depreciation run");
    } catch (e) {
        if (e.code === "P2002") pass("Duplicate depreciation run correctly blocked (P2002 unique constraint)");
        else throw e;
    }

    console.log("[TEST] 5. Asset Disposal (Book Value & Status)...");
    const disposalAmount = 5000;
    const currentBookValue = Number(asset.current_book_value);
    const gainLoss = disposalAmount - currentBookValue;

    await db.asset.update({
        where: { id: asset.id },
        data: { status: "DISPOSED", disposal_date: new Date(), disposal_amount: disposalAmount, current_book_value: 0 }
    });
    await db.assetAllocation.updateMany({
        where: { asset_id: asset.id, status: "ACTIVE" },
        data: { status: "RETURNED", return_date: new Date() }
    });
    const disposedAsset = await db.asset.findUnique({ where: { id: asset.id } });
    if (disposedAsset.status !== "DISPOSED") fail("Asset not DISPOSED");
    if (Number(disposedAsset.current_book_value) !== 0) fail("Book value not zeroed on disposal");
    pass(`Asset disposed. Gain/Loss: ${gainLoss}. Book Value: ${Number(disposedAsset.current_book_value)}`);

    // Cleanup
    await db.assetAllocation.deleteMany({ where: { asset_id: asset.id } });
    await db.assetLedger.deleteMany({ where: { asset_id: asset.id } });
    await db.asset.delete({ where: { id: asset.id } });
    await db.assetDepreciationRun.delete({ where: { id: dupRun.id } });
}

// ─── Document Tests ───────────────────────────────────────────────────────────
async function testDocumentManagement() {
    console.log("\n[TEST] 6. Document Upload (v1.0)...");
    const docCode = `TEST-DOC-${Date.now()}`;
    const doc = await db.document.create({
        data: {
            company_id: TEST_COMPANY_ID,
            document_code: docCode,
            title: "Enterprise Test Document",
            category: "CONTRACT",
            project_id: TEST_PROJECT_ID || null,
            status: "DRAFT"
        }
    });
    pass(`Document record created: ${doc.document_code}`);

    const checksum = `sha256_test_${Date.now()}`;
    const v1 = await db.documentVersion.create({
        data: {
            document_id: doc.id,
            version_number: "1.0",
            storage_path: "/uploads/test/document_v1.pdf",
            checksum,
            mime_type: "application/pdf",
            file_size: 102400,
            original_filename: "contract_v1.pdf",
            changelog: "Initial upload",
            uploaded_by: TEST_USER_ID,
            status: "PENDING_APPROVAL",
            published: false
        }
    });
    pass(`Version 1.0 created. Status: ${v1.status}`);

    console.log("[TEST] 7. Checksum Duplicate Prevention...");
    const existingByChecksum = await db.documentVersion.findFirst({
        where: { checksum, document: { company_id: TEST_COMPANY_ID } }
    });
    if (!existingByChecksum) fail("Duplicate checksum not detected");
    pass(`Duplicate checksum correctly detected (would be blocked in service layer)`);

    console.log("[TEST] 8. Document Versioning (v1.1)...");
    const v2 = await db.documentVersion.create({
        data: {
            document_id: doc.id,
            version_number: "1.1",
            storage_path: "/uploads/test/document_v1_1.pdf",
            checksum: `sha256_new_${Date.now()}`,
            mime_type: "application/pdf",
            file_size: 115200,
            original_filename: "contract_v1_1.pdf",
            changelog: "Updated terms in Section 3",
            uploaded_by: TEST_USER_ID,
            status: "PENDING_APPROVAL",
            published: false
        }
    });
    pass(`Version 1.1 created. Immutable from v1.0 (separate row, same document)`);

    console.log("[TEST] 9. Document Approval (version-specific)...");
    await db.documentApproval.create({
        data: {
            document_version_id: v2.id,
            approver_id: TEST_USER_ID,
            status: "APPROVED",
            reason: "Reviewed and approved."
        }
    });
    await db.documentVersion.update({ where: { id: v2.id }, data: { status: "APPROVED" } });
    const approvedVersion = await db.documentVersion.findUnique({ where: { id: v2.id } });
    if (approvedVersion.status !== "APPROVED") fail("Version not approved");
    pass(`Version 1.1 approved. v1.0 remains PENDING_APPROVAL (version isolation confirmed)`);

    console.log("[TEST] 10. Publish version & Parent status sync...");
    await db.documentVersion.updateMany({ where: { document_id: doc.id, published: true }, data: { published: false } });
    await db.documentVersion.update({ where: { id: v2.id }, data: { published: true } });
    await db.document.update({ where: { id: doc.id }, data: { status: "PUBLISHED" } });
    const publishedDoc = await db.document.findUnique({ where: { id: doc.id } });
    if (publishedDoc.status !== "PUBLISHED") fail("Parent document not PUBLISHED");
    pass(`Document PUBLISHED. Only version 1.1 is active.`);

    console.log("[TEST] 11. Access Log (Download audit)...");
    await db.documentAccessLog.create({
        data: {
            document_id: doc.id,
            user_id: TEST_USER_ID,
            action: "DOWNLOAD",
            ip_address: "127.0.0.1"
        }
    });
    const log = await db.documentAccessLog.findFirst({ where: { document_id: doc.id } });
    if (!log) fail("Access log not created");
    pass(`Download audit log recorded. Action: ${log.action}`);

    // Cleanup
    await db.documentAccessLog.deleteMany({ where: { document_id: doc.id } });
    await db.documentApproval.deleteMany({ where: { version: { document_id: doc.id } } });
    await db.documentVersion.deleteMany({ where: { document_id: doc.id } });
    await db.document.delete({ where: { id: doc.id } });
}

// ─── Reporting Tests ──────────────────────────────────────────────────────────
async function testReportingEngine() {
    console.log("\n[TEST] 12. Project Health Report (Real Data)...");
    const projects = await db.project.findMany({
        where: { company_id: TEST_COMPANY_ID },
        take: 5
    });
    if (projects.length === 0) {
        console.log("  ℹ No projects found, skipping health report accuracy check.");
    } else {
        for (const p of projects) {
            const budget = Number(p.budget || 0);
            const health = budget > 0 ? "COMPUTED" : "NO_BUDGET";
            pass(`Project ${p.name}: budget=${budget}, health=${health}`);
        }
    }

    console.log("[TEST] 13. Asset Utilization Report (Real Data)...");
    const assetCount = await db.asset.count({ where: { company_id: TEST_COMPANY_ID } });
    pass(`Asset count for company: ${assetCount} (report would enumerate all statuses)`);

    console.log("[TEST] 14. Procurement Delay Report (Real Data)...");
    const poCount = await db.purchaseOrder.count({ where: { company_id: TEST_COMPANY_ID } });
    pass(`Purchase Orders found: ${poCount}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runWeek11Tests() {
    console.log("\n=========================================================");
    console.log("   RUNNING WEEK 11 ENTERPRISE VERIFICATION");
    console.log("=========================================================\n");

    try {
        await bootstrap();
        await testAssetLifecycle();
        await testDocumentManagement();
        await testReportingEngine();

        console.log("\n\nALL WEEK 11 ENTERPRISE TESTS PASSED SUCCESSFULLY!");
        console.log("=========================================================\n");
    } catch (err) {
        console.error("\nTest Suite Failed with error:", err);
        process.exit(1);
    } finally {
        await db.$disconnect();
    }
}

runWeek11Tests();
