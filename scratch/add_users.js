require("dotenv").config();
const prisma = require("../src/db");
const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = 10;

async function main() {
    console.log("🚀 Starting script to add ERP Admin and Finance user...");

    // 1. Find Company
    const company = await prisma.company.findUnique({
        where: { code: "ANT-CONS" }
    });
    if (!company) {
        throw new Error("Target company 'ANT-CONS' not found in database.");
    }
    console.log(`Found Company: ${company.name} [ID: ${company.id}]`);

    // 2. Find Roles
    const erpAdminRole = await prisma.role.findUnique({
        where: { code: "erp_admin" }
    });
    if (!erpAdminRole) {
        throw new Error("Role 'erp_admin' not found in database.");
    }
    console.log(`Found Role: ${erpAdminRole.name} [ID: ${erpAdminRole.id}]`);

    const financeRole = await prisma.role.findUnique({
        where: { code: "accounts_manager" }
    });
    if (!financeRole) {
        throw new Error("Role 'accounts_manager' not found in database.");
    }
    console.log(`Found Role: ${financeRole.name} [ID: ${financeRole.id}]`);

    // 3. Find Departments
    const adminDept = await prisma.department.findUnique({
        where: { code: "DEPT-ADM" }
    });
    if (!adminDept) {
        console.warn("⚠️ Warning: Department 'DEPT-ADM' not found in database. User will be created without department.");
    } else {
        console.log(`Found Department: ${adminDept.name} [ID: ${adminDept.id}]`);
    }

    const financeDept = await prisma.department.findUnique({
        where: { code: "DEPT-FIN" }
    });
    if (!financeDept) {
        console.warn("⚠️ Warning: Department 'DEPT-FIN' not found in database. User will be created without department.");
    } else {
        console.log(`Found Department: ${financeDept.name} [ID: ${financeDept.id}]`);
    }

    // 4. Generate Hash
    const password = "Password123!";
    console.log("Hashing password...");
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 5. Create ERP Admin User
    const erpAdminEmail = "erpadmin_new@erp.com";
    const erpAdminName = "Antigravity ERP Admin";
    const erpAdmin = await prisma.user.upsert({
        where: { email: erpAdminEmail },
        update: {
            name: erpAdminName,
            password_hash: hashedPassword,
            role_id: erpAdminRole.id,
            department_id: adminDept ? adminDept.id : null,
            company_id: company.id,
            is_active: true
        },
        create: {
            email: erpAdminEmail,
            name: erpAdminName,
            password_hash: hashedPassword,
            role_id: erpAdminRole.id,
            department_id: adminDept ? adminDept.id : null,
            company_id: company.id,
            is_active: true
        }
    });
    console.log(`Successfully created/updated ERP Admin user: ${erpAdmin.email} [ID: ${erpAdmin.id}]`);

    // 6. Create Finance User
    const financeEmail = "finance_new@erp.com";
    const financeName = "Antigravity Finance Manager";
    const financeUser = await prisma.user.upsert({
        where: { email: financeEmail },
        update: {
            name: financeName,
            password_hash: hashedPassword,
            role_id: financeRole.id,
            department_id: financeDept ? financeDept.id : null,
            company_id: company.id,
            is_active: true
        },
        create: {
            email: financeEmail,
            name: financeName,
            password_hash: hashedPassword,
            role_id: financeRole.id,
            department_id: financeDept ? financeDept.id : null,
            company_id: company.id,
            is_active: true
        }
    });
    console.log(`Successfully created/updated Finance user: ${financeUser.email} [ID: ${financeUser.id}]`);

    console.log("\nUsers registration summary:");
    console.log(`- ERP Admin: ${erpAdminEmail} / Password: ${password}`);
    console.log(`- Finance User: ${financeEmail} / Password: ${password}`);
}

main()
    .catch(err => {
        console.error("Error running script:", err);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
