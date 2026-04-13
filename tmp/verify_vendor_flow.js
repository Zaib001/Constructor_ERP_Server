"use strict";

require("dotenv").config();
const prisma = require("../src/db");
const vendorsService = require("../src/modules/vendors/vendors.service");
const approvalsService = require("../src/modules/approvals/approvals.service");

async function main() {
    console.log("🚀 Starting End-to-End Vendor Flow Verification...");

    // 1. Setup/Identify test entities
    const company = await prisma.company.findFirst();
    const department = await prisma.department.findFirst();
    const employee = await prisma.user.findFirst({ where: { roles: { code: "employee" } } });
    const deptHead = await prisma.user.findFirst({ where: { roles: { code: "dept_head" } } });
    const superAdmin = await prisma.user.findFirst({ where: { roles: { code: "super_admin" } } });

    if (!company || !department || !employee || !deptHead || !superAdmin) {
        console.error("Missing required test entities (Company, Dept, Employee, DeptHead, or SuperAdmin)");
        return;
    }

    const testVendorName = "Test Logistics Group " + Date.now();
    console.log(`Step 1: Creating Vendor Request for "${testVendorName}"...`);
    
    // 2. Create Vendor (Automated approval request initiation)
    const vendorData = {
        name: testVendorName,
        email: `contact@${Date.now()}.com`,
        phone: "+966500000000",
        contact_person: "John Test",
        address: "Industrial Area, Riyadh",
        services: "Logistic services and delivery",
        department_id: department.id,
        company_id: company.id
    };

    const vendor = await vendorsService.createVendor(vendorData, employee.id);
    console.log(`✅ Vendor created in PENDING status. ID: ${vendor.id}`);

    // 3. Find the pending approval request (with retries)
    let approvalRequest = null;
    for (let i = 0; i < 5; i++) {
        approvalRequest = await prisma.approvalRequest.findFirst({
            where: { doc_id: vendor.id, doc_type: "VENDOR" },
            include: { approval_steps: true }
        });
        if (approvalRequest) break;
        console.log("Waiting for approval request creation...");
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!approvalRequest) {
        // Log all approval requests to see what we have
        const all = await prisma.approvalRequest.findMany({ take: 5, orderBy: { created_at: 'desc' } });
        console.log("Recent requests:", all.map(a => ({ id: a.id, doc_id: a.doc_id, status: a.current_status })));
        throw new Error("Approval request not created for vendor!");
    }
    console.log(`✅ Approval Request found. ID: ${approvalRequest.id}. Current Status: ${approvalRequest.current_status}. Steps: ${approvalRequest.approval_steps.length}`);

    // 4. Step 1: Dept Head Approval
    console.log("Step 2: Simulating Department Head Approval...");
    const step1 = approvalRequest.approval_steps.find(s => s.step_order === 1);
    await approvalsService.approveStep(approvalRequest.id, deptHead.id, "Dept head looks good");
    console.log("✅ Step 1 approved.");

    // 5. Step 2: Superadmin Approval
    console.log("Step 3: Simulating Superadmin Final Approval...");
    await approvalsService.approveStep(approvalRequest.id, superAdmin.id, "Superadmin final approval");
    console.log("✅ Step 2 (Final) approved.");

    // 6. Verify Final Vendor Status
    const finalVendor = await prisma.vendor.findUnique({ where: { id: vendor.id } });
    console.log(`Final Vendor Status: ${finalVendor.status}`);
    
    if (finalVendor.status === "active") {
        console.log("🏆 SUCCESS: Vendor Management Flow verified end-to-end!");
    } else {
        console.error("❌ FAILURE: Vendor status did not change to active.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
