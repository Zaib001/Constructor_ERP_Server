"use strict";

require("dotenv").config();
const prisma = require("../src/db");

/**
 * Seed Approval Matrix Rules
 *
 * Follows the official approval workflow:
 *   - QUOTATION:  Dept Head → Super Admin
 *   - PR:         Dept Head → Super Admin
 *   - PO ≤ 50K:   Dept Head only
 *   - PO > 50K:   Dept Head → Super Admin
 *   - VENDOR:     Dept Head → Super Admin
 *   - PAYROLL:    Dept Head → Super Admin
 *   - PROFIT:     Dept Head → Super Admin
 */
async function main() {
    console.log("🛠  Configuring Approval Matrix Rules...");

    // 1. Ensure roles exist
    const superAdminRole = await prisma.role.upsert({
        where: { code: "super_admin" },
        update: {},
        create: { name: "Super Admin", code: "super_admin", is_system_role: true }
    });

    const deptHeadRole = await prisma.role.upsert({
        where: { code: "dept_head" },
        update: {},
        create: { name: "Department Head", code: "dept_head", is_system_role: false }
    });

    // 2. Fetch the first company (used for company_id)
    const company = await prisma.company.findFirst({ where: { is_active: true } });
    if (!company) {
        console.error("❌ No active company found. Seed companies first.");
        return;
    }
    const companyId = company.id;

    // 3. Clear existing matrices to avoid duplicates
    await prisma.approvalMatrix.deleteMany({
        where: { doc_type: { in: ["QUOTATION", "PR", "PO", "VENDOR", "PAYROLL", "PROFIT", "PURCHASE_ORDER", "EXPENSE"] } }
    });

    const dh = deptHeadRole.id;
    const sa = superAdminRole.id;

    // Helper to build a matrix row
    const row = (docType, stepOrder, roleId, minAmt = null, maxAmt = null) => ({
        doc_type: docType,
        project_id: null,
        min_amount: minAmt,
        max_amount: maxAmt,
        role_id: roleId,
        step_order: stepOrder,
        is_parallel: false,
        is_mandatory: true,
        escalation_hours: null,
        department_id: null,
        company_id: companyId,
    });

    // 4. Insert all matrix rules
    await prisma.approvalMatrix.createMany({
        data: [
            // QUOTATION: Dept Head → Super Admin
            row("QUOTATION", 1, dh),
            row("QUOTATION", 2, sa),

            // PR (Purchase Request): Dept Head → Super Admin
            row("PR", 1, dh),
            row("PR", 2, sa),

            // PO ≤ 50,000: Dept Head only
            row("PO", 1, dh, 0, 50000),

            // PO > 50,000: Dept Head → Super Admin
            row("PO", 1, dh, 50000.01, null),
            row("PO", 2, sa, 50000.01, null),

            // VENDOR: Dept Head → Super Admin
            row("VENDOR", 1, dh),
            row("VENDOR", 2, sa),

            // PAYROLL: Dept Head → Super Admin
            row("PAYROLL", 1, dh),
            row("PAYROLL", 2, sa),

            // PROFIT: Dept Head → Super Admin
            row("PROFIT", 1, dh),
            row("PROFIT", 2, sa),

            // EXPENSE: Dept Head (Step 1 Always), Super Admin (Step 2 if > 5000)
            row("EXPENSE", 1, dh),
            row("EXPENSE", 2, sa, 5000.01, null),
        ],
    });

    // 5. UPSERT System Setting for Expense Limit
    await prisma.systemSetting.upsert({
        where: { key_company_id: { key: "EXPENSE_APPROVAL_LIMIT", company_id: companyId } },
        update: { value: "5000" },
        create: {
            key: "EXPENSE_APPROVAL_LIMIT",
            value: "5000",
            label: "Expense Approval Limit (SAR)",
            description: "Threshold for Superadmin approval on expenses",
            category: "APPROVALS",
            company_id: companyId
        }
    });

    console.log("✅  Approval Matrix configured successfully!");
    console.log("");
    console.log("   QUOTATION:  Dept Head → Super Admin");
    console.log("   PR:         Dept Head → Super Admin");
    console.log("   PO ≤ 50K:   Dept Head only");
    console.log("   PO > 50K:   Dept Head → Super Admin");
    console.log("   VENDOR:     Dept Head → Super Admin");
    console.log("   PAYROLL:    Dept Head → Super Admin");
    console.log("   PROFIT:     Dept Head → Super Admin");
    console.log("   EXPENSE ≤ 5K: Dept Head only");
    console.log("   EXPENSE > 5K: Dept Head → Super Admin");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
