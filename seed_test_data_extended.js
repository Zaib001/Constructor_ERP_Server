require('dotenv').config();
const prisma = require("./src/db");
const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = 12;
const TEST_PASSWORD = "TestPassword123!";

// Role IDs
const ROLES = {
    SUPER_ADMIN: "413852b7-f0bc-4b80-a7a7-4b011335e454",
    ERP_ADMIN: "fb8dfe6b-14d9-4dcd-8b8a-f28d70ece041",
    PM: "7677ced0-b62d-4ecd-b98f-3f70ec386508",
    ENGINEER: "5dccde57-804f-4df8-bb62-5c3292115bac"
};

async function main() {
    console.log("Starting Extended Seeding of TEST Data...");

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    // 1. Companies & Departments
    const companyA = await prisma.company.upsert({ where: { code: "TEST_HOOPOE_A" }, update: {}, create: { code: "TEST_HOOPOE_A", name: "TEST_Hoopoe Construction Ltd", is_active: true } });
    const companyB = await prisma.company.upsert({ where: { code: "TEST_SKYLINE_B" }, update: {}, create: { code: "TEST_SKYLINE_B", name: "TEST_Skyline Infrastructure", is_active: true } });

    const deptCivilA = await prisma.department.upsert({ where: { code: "TEST_CIV_A" }, update: {}, create: { code: "TEST_CIV_A", name: "TEST_Civil Engineering", company_id: companyA.id } });
    const deptProcA = await prisma.department.upsert({ where: { code: "TEST_PROC_A" }, update: {}, create: { code: "TEST_PROC_A", name: "TEST_Procurement", company_id: companyA.id } });
    const deptHRA = await prisma.department.upsert({ where: { code: "TEST_HR_A" }, update: {}, create: { code: "TEST_HR_A", name: "TEST_Human Resources A", company_id: companyA.id } });

    const deptCivilB = await prisma.department.upsert({ where: { code: "TEST_CIV_B" }, update: {}, create: { code: "TEST_CIV_B", name: "TEST_Civil Engineering B", company_id: companyB.id } });
    const deptProcB = await prisma.department.upsert({ where: { code: "TEST_PROC_B" }, update: {}, create: { code: "TEST_PROC_B", name: "TEST_Procurement B", company_id: companyB.id } });
    const deptHRB = await prisma.department.upsert({ where: { code: "TEST_HR_B" }, update: {}, create: { code: "TEST_HR_B", name: "TEST_Human Resources B", company_id: companyB.id } });

    // 2. Users (Superadmin & Heads A/B)
    const superAdmin = await prisma.user.upsert({ where: { email: "superadmin+test@erp.com" }, update: {}, create: { email: "superadmin+test@erp.com", name: "TEST_Global_Superadmin", password_hash: passwordHash, role_id: ROLES.SUPER_ADMIN, is_active: true } });
    const headA = await prisma.user.upsert({ where: { email: "head.a+test@hoopoe.com" }, update: {}, create: { email: "head.a+test@hoopoe.com", name: "TEST_Head_A", password_hash: passwordHash, role_id: ROLES.ERP_ADMIN, company_id: companyA.id, is_active: true } });
    const headB = await prisma.user.upsert({ where: { email: "head.b+test@skyline.com" }, update: {}, create: { email: "head.b+test@skyline.com", name: "TEST_Head_B", password_hash: passwordHash, role_id: ROLES.ERP_ADMIN, company_id: companyB.id, is_active: true } });

    // Dept Heads (A & B)
    const civHeadA = await prisma.user.upsert({ where: { email: "civil.head.a+test@hoopoe.com" }, update: {}, create: { email: "civil.head.a+test@hoopoe.com", name: "TEST_Civil_Head_A", password_hash: passwordHash, role_id: ROLES.PM, company_id: companyA.id, department_id: deptCivilA.id, is_active: true } });
    const civHeadB = await prisma.user.upsert({ where: { email: "civil.head.b+test@skyline.com" }, update: {}, create: { email: "civil.head.b+test@skyline.com", name: "TEST_Civil_Head_B", password_hash: passwordHash, role_id: ROLES.PM, company_id: companyB.id, department_id: deptCivilB.id, is_active: true } });
    
    // Assign heads to departments
    await prisma.department.updateMany({ where: { company_id: companyA.id }, data: { head_id: civHeadA.id } });
    await prisma.department.updateMany({ where: { company_id: companyB.id }, data: { head_id: civHeadB.id } });

    // Operational Users A
    const pmA = await prisma.user.upsert({ where: { email: "pm.a1+test@hoopoe.com" }, update: {}, create: { email: "pm.a1+test@hoopoe.com", name: "TEST_PM_A1", password_hash: passwordHash, role_id: ROLES.PM, company_id: companyA.id, department_id: deptCivilA.id, is_active: true } });
    const hrA = await prisma.user.upsert({ where: { email: "hr.a1+test@hoopoe.com" }, update: {}, create: { email: "hr.a1+test@hoopoe.com", name: "TEST_HR_A1", password_hash: passwordHash, role_id: ROLES.ENGINEER, company_id: companyA.id, department_id: deptHRA.id, designation: "HR Officer", is_active: true } });

    // Operational Users B
    const pmB = await prisma.user.upsert({ where: { email: "pm.b1+test@skyline.com" }, update: {}, create: { email: "pm.b1+test@skyline.com", name: "TEST_PM_B1", password_hash: passwordHash, role_id: ROLES.PM, company_id: companyB.id, department_id: deptCivilB.id, is_active: true } });
    const hrB = await prisma.user.upsert({ where: { email: "hr.b1+test@skyline.com" }, update: {}, create: { email: "hr.b1+test@skyline.com", name: "TEST_HR_B1", password_hash: passwordHash, role_id: ROLES.ENGINEER, company_id: companyB.id, department_id: deptHRB.id, designation: "HR Coordinator", is_active: true } });

    // 3. Projects
    const projectA1 = await prisma.project.upsert({ where: { code: "TEST_PRJ_A1" }, update: {}, create: { code: "TEST_PRJ_A1", name: "TEST_Main_Construction_A", company_id: companyA.id, status: "active" } });
    const projectB1 = await prisma.project.upsert({ where: { code: "TEST_PRJ_B1" }, update: {}, create: { code: "TEST_PRJ_B1", name: "TEST_Bridge_Alpha_B", company_id: companyB.id, status: "active" } });

    const vendorA = await prisma.vendor.create({ data: { name: "TEST_Supplier_A", company_id: companyA.id, department_id: deptProcA.id } }).catch(() => null) || await prisma.vendor.findFirst({where: {name: "TEST_Supplier_A"}});
    const vendorB = await prisma.vendor.create({ data: { name: "TEST_Supplier_B", company_id: companyB.id, department_id: deptProcB.id } }).catch(() => null) || await prisma.vendor.findFirst({where: {name: "TEST_Supplier_B"}});

    const timestamp = Date.now().toString().slice(-4);

    // 4. Quotations
    const qA = await prisma.quotation.create({ data: { quote_number: `TEST_QUO_A_${timestamp}`, company_id: companyA.id, department_id: deptProcA.id, project_id: projectA1.id, amount: 25000, created_by: pmA.id } });
    const qB = await prisma.quotation.create({ data: { quote_number: `TEST_QUO_B_${timestamp}`, company_id: companyB.id, department_id: deptProcB.id, project_id: projectB1.id, amount: 80000, created_by: pmB.id } });

    // 5. POs (A and B)
    const poLowA = await prisma.purchaseOrder.create({ data: { po_number: `TEST_PO_LOW_A_${timestamp}`, company_id: companyA.id, vendor_id: vendorA.id, amount: 15000, created_by: pmA.id } });
    const poHighA = await prisma.purchaseOrder.create({ data: { po_number: `TEST_PO_HIGH_A_${timestamp}`, company_id: companyA.id, vendor_id: vendorA.id, amount: 75000, created_by: pmA.id } });

    const poLowB = await prisma.purchaseOrder.create({ data: { po_number: `TEST_PO_LOW_B_${timestamp}`, company_id: companyB.id, vendor_id: vendorB.id, amount: 20000, created_by: pmB.id } });
    const poHighB = await prisma.purchaseOrder.create({ data: { po_number: `TEST_PO_HIGH_B_${timestamp}`, company_id: companyB.id, vendor_id: vendorB.id, amount: 120000, created_by: pmB.id } });

    // 6. Payroll
    const payA = await prisma.payroll.create({ data: { payroll_month: `03-2026-A${timestamp}`, company_id: companyA.id, department_id: deptHRA.id, total_amount: 55000, created_by: hrA.id } });
    const payB = await prisma.payroll.create({ data: { payroll_month: `03-2026-B${timestamp}`, company_id: companyB.id, department_id: deptHRB.id, total_amount: 88000, created_by: hrB.id } });

    // 7. Expenses
    const expA = await prisma.expense.create({ data: { expense_number: `TEST_EXP_A_${timestamp}`, company_id: companyA.id, department_id: deptCivilA.id, amount: 3500, category: "Travel", created_by: pmA.id } });
    const expB = await prisma.expense.create({ data: { expense_number: `TEST_EXP_B_${timestamp}`, company_id: companyB.id, department_id: deptCivilB.id, amount: 4800, category: "Office", created_by: pmB.id } });

    // 8. Trigger Approvals for ALL records
    const { requestApproval } = require("./src/modules/approvals/approvals.service");

    const reqsToTrigger = [
        { type: "Quotation", id: qA.id, amount: qA.amount, by: pmA.id },
        { type: "Quotation", id: qB.id, amount: qB.amount, by: pmB.id },
        { type: "PO", id: poLowA.id, amount: poLowA.amount, by: pmA.id },
        { type: "PO", id: poHighA.id, amount: poHighA.amount, by: pmA.id },
        { type: "PO", id: poLowB.id, amount: poLowB.amount, by: pmB.id },
        { type: "PO", id: poHighB.id, amount: poHighB.amount, by: pmB.id },
        { type: "Payroll", id: payA.id, amount: payA.total_amount, by: hrA.id },
        { type: "Payroll", id: payB.id, amount: payB.total_amount, by: hrB.id },
        { type: "Expense", id: expA.id, amount: expA.amount, by: pmA.id },
        { type: "Expense", id: expB.id, amount: expB.amount, by: pmB.id }
    ];

    for (const r of reqsToTrigger) {
        try {
            await requestApproval({ docType: r.type, docId: r.id, amount: Number(r.amount) }, r.by, "127.0.0.1", "Seed Script Vol 2");
        } catch (e) { console.error(`Failed to trigger ${r.type} ${r.id}: ${e.message}`); }
    }

    console.log("Seeding and Approval Generation Complete.");
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
