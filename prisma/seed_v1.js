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
    console.log("🚀 Starting Data Reset and Custom Seeding (v1 Final refined)...");

    // 1. CLEAR PREVIOUS DATA
    console.log("🧹 Clearing all existing data...");

    await prisma.auditLog.deleteMany();
    await prisma.systemLog.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.approvalStep.deleteMany();
    await prisma.approvalRequestItem.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.approvalMatrix.deleteMany();
    await prisma.approvalDelegation.deleteMany();
    await prisma.projectProgress.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.payroll.deleteMany();
    await prisma.purchaseOrderReceiptItem.deleteMany();
    await prisma.purchaseOrderReceipt.deleteMany();
    await prisma.supplierPayment.deleteMany();
    await prisma.supplierInvoice.deleteMany();
    await prisma.purchaseOrderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.vendor.deleteMany();
    await prisma.profitShareRule.deleteMany();
    await prisma.systemSetting.deleteMany();
    await prisma.userProject.deleteMany();
    await prisma.userSession.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.user.deleteMany();
    await prisma.department.deleteMany();
    await prisma.project.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.role.deleteMany();
    await prisma.company.deleteMany();

    console.log("✨ All tables cleared.");

    // 2. SEED PERMISSIONS (Matching Sidebar.jsx and Requirements)
    console.log("🔐 Seeding Permissions...");
    const permissionData = [
        // Operations View
        { code: "project.access.manage", module: "project", description: "View projects and progress" },
        { code: "quotation.read", module: "quotations", description: "View quotations" },
        { code: "po.read", module: "po", description: "View purchase orders" },
        { code: "vendor.read", module: "vendors", description: "View vendors" },
        { code: "payroll.read", module: "payroll", description: "View payroll" },
        { code: "expense.read", module: "expenses", description: "View expenses" },
        { code: "approval.read", module: "approvals", description: "View approvals/request status" },
        { code: "approval.request", module: "approvals", description: "Submit approval requests" },

        // Submit actions
        { code: "quotation.submit", module: "quotations", description: "Submit quotations" },
        { code: "po.submit", module: "po", description: "Submit purchase orders" },
        { code: "vendor.submit", module: "vendors", description: "Submit vendor requests" },
        { code: "payroll.submit", module: "payroll", description: "Submit payroll" },
        { code: "expense.submit", module: "expenses", description: "Submit expenses" },

        // Approve actions
        { code: "approval.approve", module: "approvals", description: "Approve requests" },
        { code: "approval.reject", module: "approvals", description: "Reject requests" },

        // Admin/System (for superadmin override)
        { code: "company.read", module: "system", description: "Read companies" },
        { code: "department.manage", module: "system", description: "Manage departments" },
        { code: "user.register", module: "auth", description: "Register users" },
        { code: "role.manage", module: "roles", description: "Manage roles" },
        { code: "audit.read", module: "system", description: "View audit logs" },
    ];

    const permissions = {};
    for (const p of permissionData) {
        permissions[p.code] = await prisma.permission.create({ data: p });
    }

    // 3. SEED ROLES
    console.log("🏛️ Seeding Roles...");
    const roles = {
        super_admin: await prisma.role.create({ data: { code: "super_admin", name: "Super Admin", is_system_role: true } }),
        dept_head: await prisma.role.create({ data: { code: "dept_head", name: "Department Head", is_system_role: false } }),
        employee: await prisma.role.create({ data: { code: "employee", name: "Employee", is_system_role: false } }),
    };

    // 4. MAP PERMISSIONS
    console.log("🔗 Mapping Permissions...");
    const map = (roleCode, permissionCodes) => permissionCodes.map(pCode => ({
        role_id: roles[roleCode].id,
        permission_id: permissions[pCode].id
    }));

    const associations = [
        ...map("super_admin", Object.keys(permissions)),

        // Head: View all modules, can submit & approve
        ...map("dept_head", [
            "project.access.manage", "quotation.read", "quotation.submit",
            "po.read", "po.submit", "vendor.read", "vendor.submit",
            "payroll.read", "payroll.submit", "expense.read", "expense.submit",
            "approval.read", "approval.request", "approval.approve", "approval.reject"
        ]),

        // Employee: View all modules, can submit
        ...map("employee", [
            "project.access.manage", "quotation.read", "quotation.submit",
            "po.read", "po.submit", "vendor.read", "vendor.submit",
            "payroll.read", "payroll.submit", "expense.read", "expense.submit",
            "approval.read", "approval.request"
        ]),
    ];
    await prisma.rolePermission.createMany({ data: associations });

    // 5. SEED SUPERADMIN (Global)
    console.log("👤 Seeding Global Superadmin...");
    const hashedPwd = await bcrypt.hash("Password123!", BCRYPT_ROUNDS);
    await prisma.user.create({
        data: {
            email: "superadmin@erp.com",
            name: "Super Admin",
            password_hash: hashedPwd,
            role_id: roles.super_admin.id,
            is_active: true
        }
    });

    // 6. SEED COMPANIES, USERS, PROJECTS, VENDORS, AND OPERATIONAL DATA
    const companyNames = ["Company A", "Company B"];

    for (const compName of companyNames) {
        console.log(`🏢 Seeding ${compName}...`);
        const companyCode = compName.toUpperCase().replace(" ", "_");
        const company = await prisma.company.create({
            data: {
                name: compName,
                code: companyCode,
                is_active: true
            }
        });

        // Add a project for each company
        const project = await prisma.project.create({
            data: {
                name: `${compName} Main Project`,
                code: `PRJ_${companyCode}`,
                company_id: company.id,
                status: "active"
            }
        });

        // Add a department
        const dept = await prisma.department.create({
            data: {
                name: "General Operations",
                code: `OPS_${companyCode}`,
                company_id: company.id
            }
        });

        // Create Department Head
        const head = await prisma.user.create({
            data: {
                email: `head@${compName.toLowerCase().replace(" ", "")}.com`,
                name: `${compName} Head`,
                password_hash: hashedPwd,
                role_id: roles.dept_head.id,
                company_id: company.id,
                department_id: dept.id,
                is_active: true
            }
        });

        // Assign Head to Project
        await prisma.userProject.create({
            data: {
                user_id: head.id,
                project_id: project.id,
                access_type: "full"
            }
        });

        // Set Head as Department Head
        await prisma.department.update({
            where: { id: dept.id },
            data: { head_id: head.id }
        });

        // Create 2 Employees
        const employees = [];
        for (let i = 1; i <= 2; i++) {
            const emp = await prisma.user.create({
                data: {
                    email: `employee${i}@${compName.toLowerCase().replace(" ", "")}.com`,
                    name: `${compName} Employee ${i}`,
                    password_hash: hashedPwd,
                    role_id: roles.employee.id,
                    company_id: company.id,
                    department_id: dept.id,
                    is_active: true
                }
            });
            employees.push(emp);

            // Assign employee to project
            await prisma.userProject.create({
                data: {
                    user_id: emp.id,
                    project_id: project.id,
                    access_type: "full"
                }
            });
        }

        // Seed Vendors
        const vendors = [];
        for (let i = 1; i <= 2; i++) {
            const vendor = await prisma.vendor.create({
                data: {
                    name: `${compName} Vendor ${i}`,
                    email: `vendor${i}@${compName.toLowerCase().replace(" ", "")}.com`,
                    company_id: company.id,
                    status: "active"
                }
            });
            vendors.push(vendor);
        }

        // Seed Approval Logic
        const docTypes = ["QUOTATION", "PO", "EXPENSE", "PAYROLL", "PR", "GRN", "AP_INVOICE", "VENDOR"];
        for (const docType of docTypes) {
            // Case 1: < 50
            await prisma.approvalMatrix.create({
                data: {
                    doc_type: docType,
                    company_id: company.id,
                    min_amount: 0,
                    max_amount: 49.99,
                    role_id: roles.dept_head.id,
                    step_order: 1,
                    is_mandatory: true
                }
            });

            // Case 2: >= 50
            await prisma.approvalMatrix.create({
                data: {
                    doc_type: docType,
                    company_id: company.id,
                    min_amount: 50,
                    max_amount: 999999999,
                    role_id: roles.dept_head.id,
                    step_order: 1,
                    is_mandatory: true
                }
            });
            await prisma.approvalMatrix.create({
                data: {
                    doc_type: docType,
                    company_id: company.id,
                    min_amount: 50,
                    max_amount: 999999999,
                    role_id: roles.super_admin.id,
                    step_order: 2,
                    is_mandatory: true
                }
            });
        }

        // Seed Operational Data
        const activeEmp = employees[0];

        // Quotations
        await prisma.quotation.create({ data: { quote_number: `QT-${companyCode}-001`, company_id: company.id, department_id: dept.id, project_id: project.id, amount: 45.00, status: "pending", created_by: activeEmp.id } });
        await prisma.quotation.create({ data: { quote_number: `QT-${companyCode}-002`, company_id: company.id, department_id: dept.id, project_id: project.id, amount: 150.00, status: "pending", created_by: activeEmp.id } });

        // Purchase Orders
        await prisma.purchaseOrder.create({ data: { po_number: `PO-${companyCode}-001`, company_id: company.id, department_id: dept.id, project_id: project.id, vendor_id: vendors[0].id, amount: 30.00, status: "pending", created_by: activeEmp.id } });
        await prisma.purchaseOrder.create({ data: { po_number: `PO-${companyCode}-002`, company_id: company.id, department_id: dept.id, project_id: project.id, vendor_id: vendors[1].id, amount: 2500.00, status: "pending", created_by: activeEmp.id } });

        // Expenses
        await prisma.expense.create({ data: { expense_number: `EXP-${companyCode}-001`, company_id: company.id, department_id: dept.id, project_id: project.id, amount: 15.50, category: "Stationery", status: "pending", created_by: activeEmp.id } });
        await prisma.expense.create({ data: { expense_number: `EXP-${companyCode}-002`, company_id: company.id, department_id: dept.id, project_id: project.id, amount: 550.00, category: "Travel", status: "pending", created_by: activeEmp.id } });

        // Payroll
        await prisma.payroll.create({ data: { payroll_month: "March 2026", company_id: company.id, department_id: dept.id, total_amount: 15000.00, status: "pending", created_by: activeEmp.id } });
    }

    console.log("✅ Custom Seeding Complete!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
