require("dotenv").config();
const prisma = require("./src/db");

// The company that is missing matrices
const MISSING_COMPANY_ID = "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6";

async function main() {
    console.log("🔍 Checking company...");
    const company = await prisma.company.findUnique({
        where: { id: MISSING_COMPANY_ID }
    });

    if (!company) {
        console.error(`❌ Company ${MISSING_COMPANY_ID} not found!`);
        return;
    }
    console.log(`✅ Company found: ${company.name} (is_active: ${company.is_active})`);

    // Get roles
    const roles = await prisma.role.findMany();
    const roleMap = {};
    roles.forEach(r => roleMap[r.code] = r.id);

    console.log("Available roles:", Object.keys(roleMap).join(", "));

    if (!roleMap["project_manager"]) {
        console.error("❌ project_manager role not found!");
        return;
    }
    if (!roleMap["accounts_manager"]) {
        console.error("❌ accounts_manager role not found!");
        return;
    }
    if (!roleMap["erp_admin"]) {
        console.error("❌ erp_admin role not found!");
        return;
    }

    // Check existing matrices for this company
    const existing = await prisma.approvalMatrix.findMany({
        where: { company_id: MISSING_COMPANY_ID }
    });
    console.log(`\n📋 Existing matrices for this company: ${existing.length}`);
    existing.forEach(m => console.log(`  - ${m.doc_type} step=${m.step_order} role=${m.role_id}`));

    if (existing.length > 0) {
        console.log("\n🧹 Clearing existing matrices for this company first...");
        await prisma.approvalMatrix.deleteMany({ where: { company_id: MISSING_COMPANY_ID } });
        console.log("✅ Cleared.");
    }

    // Template of all matrix rules
    const template = [
        // --- PR (Purchase Request) ---
        { doc_type: "PR", min_amount: 0, max_amount: 10000, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "PR", min_amount: 10001, max_amount: null, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "PR", min_amount: 10001, max_amount: null, role_id: roleMap["erp_admin"], step_order: 2 },

        // --- DPR (Daily Progress Report) ---
        { doc_type: "DPR", min_amount: 0, max_amount: 50000, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "DPR", min_amount: 50001, max_amount: null, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "DPR", min_amount: 50001, max_amount: null, role_id: roleMap["accounts_manager"], step_order: 2 },

        // --- PO (Purchase Order) ---
        { doc_type: "PO", min_amount: 0, max_amount: 50000, role_id: roleMap["erp_admin"], step_order: 1 },
        { doc_type: "PO", min_amount: 50001, max_amount: null, role_id: roleMap["erp_admin"], step_order: 1 },

        // --- Expense ---
        { doc_type: "EXPENSE", min_amount: 0, max_amount: null, role_id: roleMap["project_manager"], step_order: 1 },

        // --- Quotation ---
        { doc_type: "QUOTATION", min_amount: 0, max_amount: null, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "QUOTATION", min_amount: 0, max_amount: null, role_id: roleMap["erp_admin"], step_order: 2 },

        // --- Payroll ---
        { doc_type: "PAYROLL", min_amount: 0, max_amount: null, role_id: roleMap["erp_admin"], step_order: 1 },

        // --- MR (Material Request) ---
        { doc_type: "MR", min_amount: 0, max_amount: 50000, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "MR", min_amount: 50001, max_amount: null, role_id: roleMap["project_manager"], step_order: 1 },
        { doc_type: "MR", min_amount: 50001, max_amount: null, role_id: roleMap["accounts_manager"], step_order: 2 },

        // --- VENDOR_SELECTION ---
        { doc_type: "VENDOR_SELECTION", min_amount: 0, max_amount: null, role_id: roleMap["accounts_manager"], step_order: 1 }
    ];

    const matrixData = template.map(row => ({
        ...row,
        company_id: MISSING_COMPANY_ID,
        project_id: null  // Global (not project-specific)
    }));

    console.log(`\n📥 Inserting ${matrixData.length} matrix rules for Antigravity Construction...`);
    await prisma.approvalMatrix.createMany({ data: matrixData });
    console.log("✅ Done!\n");

    // Verify
    const afterCount = await prisma.approvalMatrix.count({ where: { company_id: MISSING_COMPANY_ID } });
    console.log(`✅ Verification: ${afterCount} matrices now exist for company ${MISSING_COMPANY_ID}`);

    // Show DPR matrices specifically
    const dprMatrices = await prisma.approvalMatrix.findMany({
        where: { company_id: MISSING_COMPANY_ID, doc_type: "DPR" },
        include: { roles: true }
    });
    console.log("\n📋 DPR Matrices for Antigravity Construction:");
    dprMatrices.forEach(m => {
        console.log(`  Step ${m.step_order}: ${m.roles?.code} | amount: ${m.min_amount}-${m.max_amount ?? '∞'}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
