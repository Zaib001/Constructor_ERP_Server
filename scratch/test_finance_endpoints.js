"use strict";

require("dotenv").config();
const prisma = require("../src/db");
const reportsService = require("../src/modules/finance/reports/reports.service");
const approvalsService = require("../src/modules/finance/approvals/financeApprovals.service");

async function runTests() {
    console.log("=== STARTING FINANCE ENDPOINTS VERIFICATION ===");

    // 1. Fetch a user to act as context
    const testUser = await prisma.user.findFirst({
        where: {
            is_active: true,
            roles: {
                code: { in: ["super_admin", "erp_admin", "accounts_manager"] }
            }
        },
        include: { roles: true }
    });

    if (!testUser) {
        console.error("❌ No suitable test user found in the DB (Super Admin, ERP Admin, or Accounts Manager). Please seed RBAC.");
        return;
    }

    const userCtx = {
        id: testUser.id,
        companyId: testUser.company_id,
        roleCode: testUser.roles.code,
        isSuperAdmin: testUser.roles.code === "super_admin"
    };

    console.log(`👤 Testing with user: ${testUser.name} (${testUser.roles.code}) [Company ID: ${testUser.company_id}]`);

    // 2. Fetch an active project
    const project = await prisma.project.findFirst({
        where: {
            company_id: testUser.company_id || undefined,
            status: "active",
            deleted_at: null
        }
    });

    if (!project) {
        console.warn("⚠️ No active projects found. Consolidated report will return empty list.");
    } else {
        console.log(`📁 Found active project for testing detailed report: ${project.name} (ID: ${project.id})`);
    }

    // --- TEST 1: Consolidated Budget vs Actual Report ---
    console.log("\n--- TEST 1: Consolidated Budget vs Actual Report ---");
    try {
        const consolidatedReport = await reportsService.getBudgetVsActualReport(testUser.company_id, {}, userCtx);
        console.log("✅ Consolidated Report success!");
        console.log("Summary:", JSON.stringify(consolidatedReport.summary, null, 2));
        console.log(`Number of projects: ${consolidatedReport.projects.length}`);
        if (consolidatedReport.projects.length > 0) {
            console.log("First project sample:", JSON.stringify(consolidatedReport.projects[0], null, 2));
        }
    } catch (err) {
        console.error("❌ Consolidated Report failed:", err.message);
    }

    // --- TEST 2: Detailed Project-Specific Budget vs Actual Report ---
    if (project) {
        console.log("\n--- TEST 2: Detailed Project Budget vs Actual Report ---");
        try {
            const detailedReport = await reportsService.getBudgetVsActualReport(testUser.company_id, { projectId: project.id }, userCtx);
            console.log("✅ Detailed Report success!");
            console.log(`Project: ${detailedReport.projectName} (${detailedReport.projectId})`);
            console.log("Summary:", JSON.stringify(detailedReport.summary, null, 2));
            console.log(`Number of WBS/Cost Code items: ${detailedReport.items.length}`);
            if (detailedReport.items.length > 0) {
                console.log("First item sample:", JSON.stringify(detailedReport.items[0], null, 2));
            }
        } catch (err) {
            console.error("❌ Detailed Report failed:", err.message);
        }
    }

    // --- TEST 3: Get Pending Approvals (Vendor / RFQ) ---
    console.log("\n--- TEST 3: Fetching Pending Approvals ---");
    try {
        const pending = await approvalsService.getPendingApprovals(userCtx);
        console.log(`✅ Pending approvals success! Found ${pending.length} pending items.`);
        if (pending.length > 0) {
            console.log("First pending approval sample:", JSON.stringify(pending[0], null, 2));
        }
    } catch (err) {
        console.error("❌ Pending approvals lookup failed:", err.message);
    }

    console.log("\n=== VERIFICATION RUN COMPLETED ===");
}

runTests()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
