"use strict";

require("dotenv").config();
const prisma = require("../src/db");
const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = 10;

async function main() {
    console.log("🚀 Seeding Dummy Finance & Admin Test Data...");

    // 1. Resolve or Create Roles
    console.log("🔑 Resolving Roles...");
    const superAdminRole = await prisma.role.upsert({
        where: { code: "super_admin" },
        update: {},
        create: { name: "Super Admin", code: "super_admin", is_system_role: true }
    });

    const erpAdminRole = await prisma.role.upsert({
        where: { code: "erp_admin" },
        update: {},
        create: { name: "ERP Admin", code: "erp_admin", is_system_role: true }
    });

    const accountsManagerRole = await prisma.role.upsert({
        where: { code: "accounts_manager" },
        update: {},
        create: { name: "Accounts Manager", code: "accounts_manager", is_system_role: false }
    });

    const projectManagerRole = await prisma.role.upsert({
        where: { code: "project_manager" },
        update: {},
        create: { name: "Project Manager", code: "project_manager", is_system_role: false }
    });

    // 2. Resolve or Create Company
    console.log("🏢 Resolving Company...");
    let company = await prisma.company.findFirst({ where: { is_active: true } });
    if (!company) {
        company = await prisma.company.create({
            data: {
                code: "CORP-01",
                name: "Main Enterprise Civil Contracting",
                is_active: true
            }
        });
    }
    const companyId = company.id;
    console.log(`Company resolved: ${company.name} (${companyId})`);

    // 3. Create Demo Users for Testing
    console.log("👥 Creating Demo Users...");
    const passwordHash = await bcrypt.hash("Password123!", BCRYPT_ROUNDS);

    const testUsersDefs = [
        { email: "super_admin@erp.com", name: "Super Admin Tester", role_id: superAdminRole.id },
        { email: "erp_admin@erp.com", name: "ERP Admin Tester", role_id: erpAdminRole.id },
        { email: "accounts_mgr@erp.com", name: "Accounts Manager Tester", role_id: accountsManagerRole.id },
        { email: "project_mgr@erp.com", name: "Project Manager Tester", role_id: projectManagerRole.id },
    ];

    const testUsers = {};
    for (const u of testUsersDefs) {
        const user = await prisma.user.upsert({
            where: { email: u.email },
            update: { is_active: true, role_id: u.role_id, company_id: companyId },
            create: {
                email: u.email,
                name: u.name,
                password_hash: passwordHash,
                role_id: u.role_id,
                company_id: companyId,
                is_active: true
            }
        });
        testUsers[u.email] = user;
    }
    console.log("Demo Users created/updated successfully! Password: Password123!");

    // 4. Create Approval Matrix mappings if missing
    console.log("🧱 Seeding Approval Matrices for the company...");
    await prisma.approvalMatrix.deleteMany({
        where: { company_id: companyId, doc_type: { in: ["VENDOR", "VENDOR_SELECTION"] } }
    });

    await prisma.approvalMatrix.createMany({
        data: [
            // Vendor Registration: Accounts Manager (Step 1) -> ERP Admin (Step 2)
            { doc_type: "VENDOR", role_id: accountsManagerRole.id, step_order: 1, is_parallel: false, is_mandatory: true, company_id: companyId },
            { doc_type: "VENDOR", role_id: erpAdminRole.id, step_order: 2, is_parallel: false, is_mandatory: true, company_id: companyId },
            // Vendor Selection: Accounts Manager (Step 1)
            { doc_type: "VENDOR_SELECTION", role_id: accountsManagerRole.id, step_order: 1, is_parallel: false, is_mandatory: true, company_id: companyId }
        ]
    });

    // 5. Create Demo Project
    console.log("📂 Creating Demo Projects...");
    const project = await prisma.project.create({
        data: {
            code: "PRJ-CIV-003",
            name: "Downtown Commercial Center",
            company_id: companyId,
            status: "active",
            budget: 1500000,
            revenue: 1800000,
            cost: 0
        }
    });

    const project2 = await prisma.project.create({
        data: {
            code: "PRJ-CIV-004",
            name: "Al-Khobar Luxury Apartments",
            company_id: companyId,
            status: "active",
            budget: 800000,
            revenue: 1000000,
            cost: 0
        }
    });

    // 6. Create WBS and Cost Codes for the Projects
    console.log("⚙️ Creating WBS & Cost Codes...");
    const wbs = await prisma.wBS.create({
        data: {
            project_id: project.id,
            wbs_code: "WBS-TOW-01",
            name: "Civil Works - Tower 1",
            status: "active"
        }
    });

    const wbs2 = await prisma.wBS.create({
        data: {
            project_id: project2.id,
            wbs_code: "WBS-APT-02",
            name: "Finishing Works - Block B",
            status: "active"
        }
    });

    const cc1 = await prisma.costCode.create({
        data: {
            wbs_id: wbs.id,
            category: "material",
            budget_amount: 500000,
            actual_amount: 0
        }
    });

    const cc2 = await prisma.costCode.create({
        data: {
            wbs_id: wbs.id,
            category: "labor",
            budget_amount: 400000,
            actual_amount: 0
        }
    });

    const cc3 = await prisma.costCode.create({
        data: {
            wbs_id: wbs.id,
            category: "equipment",
            budget_amount: 200000,
            actual_amount: 0
        }
    });

    const cc4 = await prisma.costCode.create({
        data: {
            wbs_id: wbs2.id,
            category: "material",
            budget_amount: 300000,
            actual_amount: 0
        }
    });

    const cc5 = await prisma.costCode.create({
        data: {
            wbs_id: wbs2.id,
            category: "labor",
            budget_amount: 200000,
            actual_amount: 0
        }
    });

    // 7. Seed Actual Spending Transactions (Expenses, POs, Payroll)
    console.log("💸 Seeding Spend Transactions (Expenses & POs)...");

    // Project 1 Expenses
    await prisma.expense.create({
        data: {
            expense_number: "EXP-DOWNTOWN-001",
            company_id: companyId,
            project_id: project.id,
            cost_code_id: cc1.id,
            amount: 120000,
            category: "Materials",
            description: "Ready-mix Concrete delivery batch 1-10",
            status: "approved",
            created_by: testUsers["project_mgr@erp.com"].id
        }
    });

    await prisma.expense.create({
        data: {
            expense_number: "EXP-DOWNTOWN-002",
            company_id: companyId,
            project_id: project.id,
            cost_code_id: cc3.id,
            amount: 95000,
            category: "Equipment",
            description: "Monthly Mobile Crane lease",
            status: "approved",
            created_by: testUsers["project_mgr@erp.com"].id
        }
    });

    // Project 2 Expenses (Overspending to test "OVERSPENT" status)
    await prisma.expense.create({
        data: {
            expense_number: "EXP-ALKHOBAR-001",
            company_id: companyId,
            project_id: project2.id,
            cost_code_id: cc5.id,
            amount: 220000, // Budget is 200,000 for labor
            category: "Labor",
            description: "Blockmason subcontractor team mobilization",
            status: "approved",
            created_by: testUsers["project_mgr@erp.com"].id
        }
    });

    // 8. Create a Pending Vendor Registration & Approval Steps
    console.log("📝 Creating Pending Vendor Approval...");
    const pendingVendor = await prisma.vendor.create({
        data: {
            company_id: companyId,
            name: "Riyadh Industrial Steel Corp",
            email: "approvals@riyadhsteel.com.sa",
            phone: "+966 11 405 1200",
            contact_person: "Eng. Tariq Al-Jamil",
            address: "Building 45, Phase 2 Industrial City, Riyadh",
            tax_id: "300056123400003",
            category: "Steel & Rebar Fabrications",
            status: "pending",
            created_by: testUsers["project_mgr@erp.com"].id,
            bank_details: {
                bankName: "Al Rajhi Bank",
                accountName: "Riyadh Industrial Steel Corp",
                iban: "SA8080000001234567890123"
            }
        }
    });

    const vendorRequest = await prisma.approvalRequest.create({
        data: {
            doc_type: "VENDOR",
            doc_id: pendingVendor.id,
            company_id: companyId,
            requested_by: testUsers["project_mgr@erp.com"].id,
            current_status: "in_progress",
            total_steps: 2,
            current_step: 1,
            amount: 0,
            is_completed: false
        }
    });

    await prisma.approvalStep.createMany({
        data: [
            {
                approval_request_id: vendorRequest.id,
                step_order: 1,
                role_id: accountsManagerRole.id,
                approver_user: testUsers["accounts_mgr@erp.com"].id,
                status: "pending"
            },
            {
                approval_request_id: vendorRequest.id,
                step_order: 2,
                role_id: erpAdminRole.id,
                status: "pending"
            }
        ]
    });

    // 9. Create a Pending RFQ comparison (VENDOR_SELECTION) Approval
    console.log("⚖️ Creating Pending RFQ Selection Approval...");
    const pr = await prisma.purchaseRequisition.create({
        data: {
            pr_no: `PR-${Date.now()}`,
            company_id: companyId,
            project_id: project.id,
            wbs_id: wbs.id,
            requested_by: testUsers["project_mgr@erp.com"].id,
            reason: "Procurement of Structural Rebar",
            status: "approved_for_rfq"
        }
    });

    const rfq = await prisma.rFQ.create({
        data: {
            rfq_no: `RFQ-STEEL-102`,
            requisition_id: pr.id,
            created_by: testUsers["project_mgr@erp.com"].id,
            notes: "Please quote for 50 Tons of structural reinforcing bars.",
            status: "issued"
        }
    });

    // Create a vendor quote details
    const vendorQuote = await prisma.vendorQuote.create({
        data: {
            rfq_id: rfq.id,
            vendor_id: pendingVendor.id,
            delivery_days: 14,
            notes: "Direct factory shipment.",
            status: "submitted"
        }
    });

    await prisma.vendorQuoteItem.create({
        data: {
            quote_id: vendorQuote.id,
            quantity: 50,
            unit_price: 3200,
            total_price: 160000
        }
    });

    const comparison = await prisma.comparisonEngine.create({
        data: {
            rfq_id: rfq.id,
            selected_vendor_id: pendingVendor.id,
            selection_reason: "Lowest price complying with structural specifications.",
            compared_by: testUsers["project_mgr@erp.com"].id,
            comparison_snapshot: {}
        }
    });

    const rfqRequest = await prisma.approvalRequest.create({
        data: {
            doc_type: "VENDOR_SELECTION",
            doc_id: comparison.id,
            company_id: companyId,
            project_id: project.id,
            requested_by: testUsers["project_mgr@erp.com"].id,
            current_status: "in_progress",
            total_steps: 1,
            current_step: 1,
            amount: 160000,
            is_completed: false
        }
    });

    await prisma.approvalStep.create({
        data: {
            approval_request_id: rfqRequest.id,
            step_order: 1,
            role_id: accountsManagerRole.id,
            approver_user: testUsers["accounts_mgr@erp.com"].id,
            status: "pending"
        }
    });

    console.log("✅ Seeding of Dummy Finance & Admin Test Data Completed!");
    console.log("------------------------------------------");
    console.log("Demo Users for testing (Password is Password123!):");
    console.log("   Accounts Mgr (Tester)  -> accounts_mgr@erp.com");
    console.log("   ERP Admin (Tester)     -> erp_admin@erp.com");
    console.log("   Project Mgr (Tester)   -> project_mgr@erp.com");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
