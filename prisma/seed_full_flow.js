"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BCRYPT_ROUNDS = 10;

async function main() {
    console.log("🚀 Starting Full Flow Seeding...");

    // 1. CLEAR PREVIOUS DATA
    console.log("🧹 Clearing existing data...");
    await prisma.auditLog.deleteMany();
    await prisma.systemLog.deleteMany();
    
    await prisma.approvalStep.deleteMany();
    await prisma.approvalRequestItem.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.approvalMatrix.deleteMany();
    await prisma.approvalDelegation.deleteMany();

    await prisma.purchaseOrder.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.payroll.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.vendor.deleteMany();

    await prisma.userSession.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.userProject.deleteMany();
    await prisma.profitShareRule.deleteMany();

    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
    await prisma.department.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.role.deleteMany();
    await prisma.systemSetting.deleteMany();
    await prisma.company.deleteMany();

    // 2. SEED PERMISSIONS
    console.log("🔐 Seeding Permissions...");
    const permissionData = [
        { code: "user.register", module: "auth", description: "Register new users" },
        { code: "user.lock", module: "auth", description: "Lock/Unlock users" },
        { code: "role.manage", module: "roles", description: "Full role management" },
        { code: "permission.manage", module: "roles", description: "Create system permissions" },
        { code: "project.access.manage", module: "project", description: "Assign/Revoke project access" },
        { code: "project.view_users", module: "project", description: "View users in project" },
        { code: "company.read", module: "companies", description: "View company data" },
        { code: "company.manage", module: "companies", description: "Manage companies" },
        { code: "department.manage", module: "departments", description: "Manage departments" },
        { code: "approval.read", module: "approvals", description: "View Inbox and History" },
        { code: "approval.approve", module: "approvals", description: "Approve assigned steps" },
        { code: "approval.reject", module: "approvals", description: "Reject any assigned request" },
        { code: "approval.request", module: "approvals", description: "Create new approval requests" },
        { code: "audit.read", module: "audit", description: "View audit logs" },
        { code: "system.read", module: "audit", description: "View system health/logs" },
        { code: "delegation.manage", module: "delegation", description: "Create and disable delegations" },
        { code: "delegation.read", module: "delegation", description: "View system delegations" },
        { code: "profitshare.read", module: "finance", description: "View profit share data" },
        { code: "settings.read", module: "settings", description: "View system settings" },
        { code: "expense.read", module: "expenses", description: "View expense requests" },
        { code: "dashboard.superadmin", module: "dashboard", description: "Access Group Superadmin Dashboard" },
    ];

    const permissions = {};
    for (const p of permissionData) {
        permissions[p.code] = await prisma.permission.create({ data: p });
    }

    // 3. SEED ROLES
    console.log("🏛️ Seeding Roles...");
    const roleDefinitions = [
        { code: "super_admin", name: "Super Admin", description: "Total system owner", is_system_role: true },
        { code: "erp_admin", name: "ERP Admin", description: "Operations and user controller", is_system_role: true },
        { code: "dept_head", name: "Department Head", description: "Manages department logic", is_system_role: false },
        { code: "employee", name: "Employee", description: "Standard operational user", is_system_role: false },
    ];

    const roles = {};
    for (const r of roleDefinitions) {
        roles[r.code] = await prisma.role.create({ data: r });
    }

    // 4. MAP PERMISSIONS
    console.log("🔗 Mapping RBAC Matrix...");
    const map = (roleCode, permissionCodes) => {
        return permissionCodes.map(pCode => ({
            role_id: roles[roleCode].id,
            permission_id: permissions[pCode].id
        }));
    };

    const associations = [
        ...map("super_admin", Object.keys(permissions)),
        ...map("erp_admin", ["user.register", "user.lock", "role.manage", "project.access.manage", "company.read", "approval.read", "approval.approve", "approval.reject", "audit.read", "system.read"]),
        ...map("dept_head", ["approval.read", "approval.approve", "approval.reject", "approval.request"]),
        ...map("employee", ["approval.request", "approval.read"]),
    ];
    await prisma.rolePermission.createMany({ data: associations });

    // 5. SEED COMPANIES
    console.log("🏢 Seeding Multi-Companies...");
    const companiesData = [
        { code: "MAG-CIVIL", name: "MAG Unified – Civil Contracting" },
        { code: "MAG-MECH", name: "MAG Unified – Mechanical Contracting" },
        { code: "MAG-ELEC", name: "MAG Allied – Electromechanical" },
        { code: "MAG-SCAF", name: "MAG Scaffolding – Scaffolding & Access" },
        { code: "MAG-CONS", name: "MAG Alliance – Design & Consulting" }
    ];

    const companies = {};
    for (const c of companiesData) {
        companies[c.code] = await prisma.company.create({ data: c });
    }

    // 6. SEED USERS
    console.log("👥 Seeding Users...");
    const hashedDefault = await bcrypt.hash("Password123!", BCRYPT_ROUNDS);
    
    // Superadmin (Group Owner)
    const superadmin = await prisma.user.create({
        data: {
            email: "superadmin@erp.com",
            name: "Superadmin (Group Owner)",
            password_hash: hashedDefault,
            role_id: roles.super_admin.id,
            is_active: true
        }
    });

    const users = { superadmin };

    // 7. SEED DEPARTMENTS & ASSIGN HEADS for MAG-CIVIL
    console.log("🏢 Seeding Departments for MAG-CIVIL...");
    const depts = ["Engineering", "Procurement", "Finance", "HR", "Operations", "Sales"];
    const departments = {};

    for (const deptName of depts) {
        const code = `CIV-DEPT-${deptName.toUpperCase()}`;
        
        // Create a Dept Head for each
        const headEmail = `head-${deptName.toLowerCase()}@mag-civil.com`;
        const head = await prisma.user.create({
            data: {
                email: headEmail,
                name: `${deptName} Head`,
                password_hash: hashedDefault,
                role_id: roles.dept_head.id,
                company_id: companies["MAG-CIVIL"].id,
                is_active: true
            }
        });
        users[headEmail] = head;

        const dept = await prisma.department.create({
            data: {
                code: code,
                name: deptName,
                company_id: companies["MAG-CIVIL"].id,
                head_id: head.id,
                is_active: true
            }
        });
        departments[deptName] = dept;

        // Link head to dept
        await prisma.user.update({
            where: { id: head.id },
            data: { department_id: dept.id }
        });
    }

    // 7.5 SEED EMPLOYEE USERS under departments
    console.log("👷 Seeding Employee Users...");

    // Add operational permissions to employee role
    const employeeExtraPerms = ["vendor.read", "po.read", "quotation.read", "payroll.read", "expense.read"];
    for (const permCode of employeeExtraPerms) {
        if (permissions[permCode]) {
            await prisma.rolePermission.create({
                data: { role_id: roles.employee.id, permission_id: permissions[permCode].id }
            }).catch(() => {}); // Ignore if already exists
        }
    }

    const employeeDefs = [
        { email: "eng-employee1@mag-civil.com", name: "Ahmed Al-Farsi", dept: "Engineering" },
        { email: "eng-employee2@mag-civil.com", name: "Khalid Mustafa", dept: "Engineering" },
        { email: "proc-employee1@mag-civil.com", name: "Yusuf Rahman", dept: "Procurement" },
        { email: "proc-employee2@mag-civil.com", name: "Omar Siddiqui", dept: "Procurement" },
    ];

    for (const emp of employeeDefs) {
        const empUser = await prisma.user.create({
            data: {
                email: emp.email,
                name: emp.name,
                password_hash: hashedDefault,
                role_id: roles.employee.id,
                company_id: companies["MAG-CIVIL"].id,
                department_id: departments[emp.dept].id,
                is_active: true
            }
        });
        users[emp.email] = empUser;
    }

    // 8. SEED SYSTEM SETTINGS
    console.log("⚙️ Seeding System Settings...");
    await prisma.systemSetting.create({
        data: {
            key: "PO_APPROVAL_LIMIT",
            value: "50000",
            label: "PO Approval Limit (SAR)",
            description: "Amount threshold for multi-step PO approval",
            category: "APPROVALS",
            company_id: companies["MAG-CIVIL"].id
        }
    });

    // 9. SEED APPROVAL MATRIX
    console.log("🧱 Seeding Approval Matrix Rules...");
    /*
        Rules:
        Quotation -> Dept Head (1) + Superadmin (2)
        PO < 50k -> Dept Head (1)
        PO > 50k -> Dept Head (1) + Superadmin (2)
        Salary -> Dept Head (1) + Superadmin (2)
        Vendor -> Superadmin (1)
        Profit -> Superadmin (1)
    */
    const matrixRules = [
        // Quotation
        { doc_type: "QUOTATION", step_order: 1, role_id: roles.dept_head.id, company_id: companies["MAG-CIVIL"].id },
        { doc_type: "QUOTATION", step_order: 2, role_id: roles.super_admin.id, company_id: companies["MAG-CIVIL"].id },
        // PO < 50k
        { doc_type: "PO", min_amount: 0, max_amount: 50000, step_order: 1, role_id: roles.dept_head.id, company_id: companies["MAG-CIVIL"].id },
        // PO > 50k
        { doc_type: "PO", min_amount: 50000.01, step_order: 1, role_id: roles.dept_head.id, company_id: companies["MAG-CIVIL"].id },
        { doc_type: "PO", min_amount: 50000.01, step_order: 2, role_id: roles.super_admin.id, company_id: companies["MAG-CIVIL"].id },
        // Salary
        { doc_type: "PAYROLL", step_order: 1, role_id: roles.dept_head.id, company_id: companies["MAG-CIVIL"].id },
        { doc_type: "PAYROLL", step_order: 2, role_id: roles.super_admin.id, company_id: companies["MAG-CIVIL"].id },
        // Vendor Creation
        { doc_type: "VENDOR", step_order: 1, role_id: roles.super_admin.id, company_id: companies["MAG-CIVIL"].id },
        // Profit Withdrawal
        { doc_type: "PROFIT", step_order: 1, role_id: roles.super_admin.id, company_id: companies["MAG-CIVIL"].id },
    ];

    await prisma.approvalMatrix.createMany({ data: matrixRules });

    // 10. SEED SAMPLE PROJECTS
    console.log("📂 Seeding Projects...");
    const project = await prisma.project.create({
        data: {
            code: "PRJ-CIV-001",
            name: "Civil Works - Tower A",
            company_id: companies["MAG-CIVIL"].id,
            status: "active",
            budget: 1000000,
            revenue: 1200000,
            cost: 800000
        }
    });

    const project2 = await prisma.project.create({
        data: {
            code: "PRJ-CIV-002",
            name: "Infrastructure - Road Network",
            company_id: companies["MAG-CIVIL"].id,
            status: "active",
            budget: 500000,
            revenue: 600000,
            cost: 350000
        }
    });

    // 11. SEED PROFIT SHARE RULES
    console.log("💰 Seeding Profit Share Rules...");
    await prisma.profitShareRule.create({
        data: {
            name: "Standard 50/50 Split",
            entity_type: "COMPANY",
            company_id: companies["MAG-CIVIL"].id,
            partner_a_name: "Company Share",
            partner_a_share: 50,
            partner_b_name: "Department Share",
            partner_b_share: 50,
            is_active: true
        }
    });

    console.log("✅ Seeding Complete!");
    console.log("------------------------------------------");
    console.log("Superadmin Login: superadmin@erp.com / Password123!");
    console.log("Engineering Head Login: head-engineering@mag-civil.com / Password123!");
    console.log("Employee Login: eng-employee1@mag-civil.com / Password123!");
    console.log("Employee Login: proc-employee1@mag-civil.com / Password123!");
}

main()
    .catch((e) => {
        console.error("❌ Seed Error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
