/**
 * seed_test_data.js
 * 
 * Purpose: Seed structured test data for RBAC and multi-company isolation verification.
 * Run: node seed_test_data.js
 */

require('dotenv').config();
const prisma = require("./src/db");
const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = 12;
const TEST_PASSWORD = "TestPassword123!";

// Role IDs (Confirmed from DB)
const ROLES = {
    SUPER_ADMIN: "413852b7-f0bc-4b80-a7a7-4b011335e454",
    ERP_ADMIN: "fb8dfe6b-14d9-4dcd-8b8a-f28d70ece041",
    PM: "7677ced0-b62d-4ecd-b98f-3f70ec386508",
    ENGINEER: "5dccde57-804f-4df8-bb62-5c3292115bac"
};

async function main() {
    console.log("≡ƒÜº Starting Seeding of TEST Data...");

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    // 1. Create Companies
    const companyA = await prisma.company.upsert({
        where: { code: "TEST_HOOPOE_A" },
        update: {},
        create: {
            code: "TEST_HOOPOE_A",
            name: "TEST_Hoopoe Construction Ltd",
            is_active: true
        }
    });

    const companyB = await prisma.company.upsert({
        where: { code: "TEST_SKYLINE_B" },
        update: {},
        create: {
            code: "TEST_SKYLINE_B",
            name: "TEST_Skyline Infrastructure",
            is_active: true
        }
    });

    console.log("Ô£à Companies seeded.");

    // 2. Create Departments
    const deptCivilA = await prisma.department.upsert({
        where: { code: "TEST_CIV_A" },
        update: {},
        create: {
            code: "TEST_CIV_A",
            name: "TEST_Civil Engineering",
            company_id: companyA.id
        }
    });

    const deptProcA = await prisma.department.upsert({
        where: { code: "TEST_PROC_A" },
        update: {},
        create: {
            code: "TEST_PROC_A",
            name: "TEST_Procurement",
            company_id: companyA.id
        }
    });

    const deptCivilB = await prisma.department.upsert({
        where: { code: "TEST_CIV_B" },
        update: {},
        create: {
            code: "TEST_CIV_B",
            name: "TEST_Civil Engineering",
            company_id: companyB.id
        }
    });

    console.log("Ô£à Departments seeded.");

    // 3. Create Users
    // Superadmin
    const superAdmin = await prisma.user.upsert({
        where: { email: "superadmin+test@erp.com" },
        update: {},
        create: {
            email: "superadmin+test@erp.com",
            name: "TEST_Global_Superadmin",
            password_hash: passwordHash,
            role_id: ROLES.SUPER_ADMIN,
            is_active: true
        }
    });

    // Company A Head
    const headA = await prisma.user.upsert({
        where: { email: "head.a+test@hoopoe.com" },
        update: {},
        create: {
            email: "head.a+test@hoopoe.com",
            name: "TEST_Head_A",
            password_hash: passwordHash,
            role_id: ROLES.ERP_ADMIN,
            company_id: companyA.id,
            is_active: true
        }
    });

    // Company B Head
    const headB = await prisma.user.upsert({
        where: { email: "head.b+test@skyline.com" },
        update: {},
        create: {
            email: "head.b+test@skyline.com",
            name: "TEST_Head_B",
            password_hash: passwordHash,
            role_id: ROLES.ERP_ADMIN,
            company_id: companyB.id,
            is_active: true
        }
    });

    // Dept Heads (assigned as Head_ID later)
    const civHeadA = await prisma.user.upsert({
        where: { email: "civil.head.a+test@hoopoe.com" },
        update: {},
        create: {
            email: "civil.head.a+test@hoopoe.com",
            name: "TEST_Civil_Head_A",
            password_hash: passwordHash,
            role_id: ROLES.PM,
            company_id: companyA.id,
            department_id: deptCivilA.id,
            is_active: true
        }
    });

    await prisma.department.update({
        where: { id: deptCivilA.id },
        data: { head_id: civHeadA.id }
    });

    // Employees
    const pmA = await prisma.user.upsert({
        where: { email: "pm.a1+test@hoopoe.com" },
        update: {},
        create: {
            email: "pm.a1+test@hoopoe.com",
            name: "TEST_PM_A1",
            password_hash: passwordHash,
            role_id: ROLES.PM,
            company_id: companyA.id,
            department_id: deptCivilA.id,
            is_active: true
        }
    });

    const engA = await prisma.user.upsert({
        where: { email: "eng.a1+test@hoopoe.com" },
        update: {},
        create: {
            email: "eng.a1+test@hoopoe.com",
            name: "TEST_Engineer_A1",
            password_hash: passwordHash,
            role_id: ROLES.ENGINEER,
            company_id: companyA.id,
            department_id: deptCivilA.id,
            designation: "Site Engineer",
            is_active: true
        }
    });

    console.log("Ô£à Users seeded.");

    // 4. Projects
    const projectA1 = await prisma.project.upsert({
        where: { code: "TEST_PRJ_A1" },
        update: {},
        create: {
            code: "TEST_PRJ_A1",
            name: "TEST_Main_Construction_A",
            company_id: companyA.id,
            status: "active"
        }
    });

    const projectB1 = await prisma.project.upsert({
        where: { code: "TEST_PRJ_B1" },
        update: {},
        create: {
            code: "TEST_PRJ_B1",
            name: "TEST_Bridge_Alpha_B",
            company_id: companyB.id,
            status: "active"
        }
    });

    // Assign Users to Projects
    await prisma.userProject.createMany({
        data: [
            { user_id: pmA.id, project_id: projectA1.id, access_type: "manager" },
            { user_id: engA.id, project_id: projectA1.id, access_type: "contributor" }
        ],
        skipDuplicates: true
    });

    console.log("Ô£à Projects seeded.");

    // 5. Fleet & Employees (Personnel)
    await prisma.employee.create({
        data: {
            name: "TEST_Staff_Member_A1",
            department: "Civil",
            designation: "Staff",
            project_id: projectA1.id,
            iqama_no: "TEST_IQ_A1"
        }
    });

    await prisma.vehicle.create({
        data: {
            vehicle_no: "TEST_VEH_A1",
            plate_no: "TEST_PLA_A1",
            running_site: projectA1.id
        }
    });

    console.log("Ô£à Fleet & Personnel seeded.");

    // 6. Vendors & Procurement
    const vendorA = await prisma.vendor.create({
        data: {
            name: "TEST_Supplier_A",
            company_id: companyA.id,
            department_id: deptProcA.id,
            contact_person: "Test Contact"
        }
    });

    // PO < 50k (Small)
    const poSmallA = await prisma.purchaseOrder.create({
        data: {
            po_number: "TEST_PO_LOW_A",
            company_id: companyA.id,
            vendor_id: vendorA.id,
            amount: 15000,
            status: "draft",
            created_by: pmA.id
        }
    });

    // PO > 50k (Large)
    const poLargeA = await prisma.purchaseOrder.create({
        data: {
            po_number: "TEST_PO_HIGH_A",
            company_id: companyA.id,
            vendor_id: vendorA.id,
            amount: 75000,
            status: "draft",
            created_by: pmA.id
        }
    });

    console.log("Ô£à Procurement seeded.");

    // 7. Payroll & Expenses
    await prisma.payroll.create({
        data: {
            payroll_month: "2026-03",
            company_id: companyA.id,
            total_amount: 500000,
            status: "draft",
            created_by: headA.id
        }
    });

    await prisma.expense.create({
        data: {
            expense_number: "TEST_EXP_A1",
            company_id: companyA.id,
            amount: 5000,
            category: "Traveling",
            status: "draft",
            created_by: pmA.id
        }
    });

    console.log("Ô£à Finance seeded.");

    // 8. Trigger Approvals (via manual step creation to verify logic)
    // We can simulate the requestApproval logic here for the POs
    const { requestApproval } = require("./src/modules/approvals/approvals.service");

    console.log("≡ƒôü Triggering Approval Multi-Step Flows...");
    
    try {
        await requestApproval({
            docType: "PO",
            docId: poSmallA.id,
            amount: 15000
        }, pmA.id, "127.0.0.1", "Seed Script");
        
        await requestApproval({
            docType: "PO",
            docId: poLargeA.id,
            amount: 75000
        }, pmA.id, "127.0.0.1", "Seed Script");
        
        console.log("Ô£à Approval Requests triggered.");
    } catch (err) {
        console.error("ÔØî Error triggering approvals:", err.message);
    }

    console.log("\nÔ£¿ SEEDING COMPLETE! Ô£¿");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
