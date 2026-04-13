"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({
    connectionString,
    max: 8,
    ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BCRYPT_ROUNDS = 10;

async function clearAllData() {
    console.log("🧹 Clearing ALL existing data (full reset)...");

    try {
        const result = await prisma.$queryRawUnsafe(`
            SELECT table_schema || '.' || table_name AS table_name
            FROM information_schema.tables
            WHERE table_schema IN ('auth', 'audit') AND table_type = 'BASE TABLE'
        `);
        
        const tables = result.map(t => t.table_name);
        if (tables.length > 0) {
            await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(', ')} CASCADE`);
            console.log(`✅ All data truncated successfully via CASCADE (${tables.length} tables).`);
        }
    } catch (error) {
        console.error("⚠️ Truncate failed:", error);
        process.exit(1);
    }
}

async function main() {
    console.log("🚀 Starting Enterprise RBAC Seed (Full ERP)...");

    await clearAllData();

    // ─── COMPANIES ───────────────────────────────────────────────────────────────
    console.log("🏢 Seeding Companies...");
    const mainCo = await prisma.company.create({
        data: {
            code: "ANT-CONS",
            name: "Antigravity Construction",
            email: "info@antigravity.sa",
            address: "Riyadh Digital City",
            vat_number: "300000000000003",
            registration_number: "1010000001"
        }
    });
    const secondCo = await prisma.company.create({
        data: {
            code: "MB-CORP",
            name: "MegaBuild Corp",
            email: "contact@megabuild.sa",
            address: "Jeddah Industrial Gate"
        }
    });

    // ─── DEPARTMENTS ─────────────────────────────────────────────────────────────
    console.log("📂 Seeding Departments...");
    const depts = {};
    const deptsData = [
        { code: "DEPT-CIV", name: "Civil Engineering", company_id: mainCo.id },
        { code: "DEPT-MEP", name: "MEP & Electrical", company_id: mainCo.id },
        { code: "DEPT-PRO", name: "Procurement & Logistics", company_id: mainCo.id },
        { code: "DEPT-ADM", name: "Administration & HR", company_id: mainCo.id },
        { code: "DEPT-FIN", name: "Finance & Accounts", company_id: mainCo.id },
        { code: "DEPT-FLT", name: "Fleet & Equipment", company_id: mainCo.id },
    ];
    for (const d of deptsData) {
        depts[d.code] = await prisma.department.create({ data: d });
    }

    // ─── PERMISSIONS ─────────────────────────────────────────────────────────────
    console.log("🔐 Seeding Enterprise Permissions...");

    const allPermissions = [
        // ── Governance / Admin ──────────────────────────────────────────────────
        { code: "approval.read",          module: "approvals",    description: "View approval inbox and history" },
        { code: "approval.request",       module: "approvals",    description: "Submit documents for approval" },
        { code: "approval.approve",       module: "approvals",    description: "Approve assigned workflow steps" },
        { code: "approval.reject",        module: "approvals",    description: "Reject approval steps" },
        { code: "audit.read",             module: "audit",        description: "View global audit logs" },
        { code: "delegation.read",        module: "delegations",  description: "View approval delegations" },
        { code: "delegation.manage",      module: "delegations",  description: "Create and manage delegations" },
        { code: "role.manage",            module: "roles",        description: "Create and manage roles/permissions" },
        { code: "user.read",              module: "users",        description: "View users list" },
        { code: "user.register",          module: "users",        description: "Register new users" },
        { code: "user.update",            module: "users",        description: "Update user profiles and roles" },
        { code: "department.read",        module: "departments",  description: "View departments" },
        { code: "department.manage",      module: "departments",  description: "Create and manage departments" },
        { code: "system.read",            module: "system",       description: "View system health and logs" },
        { code: "settings.read",          module: "settings",     description: "View system settings" },
        { code: "settings.manage",        module: "settings",     description: "Manage enterprise configuration" },
        { code: "company.read",           module: "companies",    description: "View companies" },
        { code: "company.create",         module: "companies",    description: "Create new companies" },
        { code: "company.update",         module: "companies",    description: "Update company details" },
        { code: "company.manage",         module: "companies",    description: "Full company administration" },
        { code: "dashboard.superadmin",   module: "dashboard",    description: "Access superadmin group overview" },
        { code: "dashboard.company",      module: "dashboard",    description: "Access company-level executive dashboard" },
        { code: "dashboard.project",      module: "dashboard",    description: "Access project-level operational dashboard" },
        { code: "dashboard.department",   module: "dashboard",    description: "Access department-level metrics dashboard" },
        { code: "dashboard.compliance",   module: "dashboard",    description: "Access global compliance and expiry dashboard" },

        // ── Projects / WBS ──────────────────────────────────────────────────────
        { code: "project.read",           module: "projects",     description: "View projects" },
        { code: "project.create",         module: "projects",     description: "Create new projects" },
        { code: "project.update",         module: "projects",     description: "Update project details" },
        { code: "project.archive",        module: "projects",     description: "Archive / close projects" },
        { code: "project.access.manage",  module: "projects",     description: "Manage project user assignments" },
        { code: "wbs.read",               module: "wbs",          description: "View WBS structures" },
        { code: "wbs.create",             module: "wbs",          description: "Create WBS nodes and cost codes" },
        { code: "wbs.update",             module: "wbs",          description: "Update WBS and budgets" },
        { code: "wbs.archive",            module: "wbs",          description: "Archive WBS entries" },

        // ── Master Data ─────────────────────────────────────────────────────────
        { code: "item.read",              module: "items",        description: "View item catalog" },
        { code: "item.create",            module: "items",        description: "Create catalog items" },
        { code: "item.update",            module: "items",        description: "Update catalog items" },
        { code: "employee.read",          module: "employees",    description: "View employee records" },
        { code: "employee.create",        module: "employees",    description: "Create employee records" },
        { code: "employee.update",        module: "employees",    description: "Update employee records" },
        { code: "employee.archive",       module: "employees",    description: "Archive employees" },
        { code: "fleet.read",             module: "fleet",        description: "View vehicles and equipment" },
        { code: "fleet.create",           module: "fleet",        description: "Add vehicles and equipment" },
        { code: "fleet.update",           module: "fleet",        description: "Update fleet records" },
        { code: "document.read",          module: "documents",    description: "View compliance documents" },
        { code: "document.create",        module: "documents",    description: "Upload documents" },
        { code: "document.update",        module: "documents",    description: "Update document records" },

        // ── Vendors ─────────────────────────────────────────────────────────────
        { code: "vendor.read",            module: "vendors",      description: "View vendor directory" },
        { code: "vendor.create",          module: "vendors",      description: "Register new vendors" },
        { code: "vendor.update",          module: "vendors",      description: "Update and manage vendor lifecycle" },
        { code: "vendor.approve",         module: "vendors",      description: "Approve/activate/suspend vendors" },

        // ── Procurement ─────────────────────────────────────────────────────────
        { code: "procurement.pr.read",           module: "procurement", description: "View purchase requisitions" },
        { code: "procurement.pr.create",         module: "procurement", description: "Create purchase requisitions" },
        { code: "procurement.pr.update",         module: "procurement", description: "Update draft PRs" },
        { code: "procurement.pr.submit",         module: "procurement", description: "Submit PRs for approval" },
        { code: "procurement.pr.approve",        module: "procurement", description: "Approve purchase requisitions" },
        { code: "procurement.rfq.read",          module: "procurement", description: "View RFQs" },
        { code: "procurement.rfq.create",        module: "procurement", description: "Create RFQs" },
        { code: "procurement.rfq.update",        module: "procurement", description: "Update RFQ details" },
        { code: "procurement.rfq.issue",         module: "procurement", description: "Issue RFQ to vendors" },
        { code: "procurement.quote.read",        module: "procurement", description: "View vendor quotations" },
        { code: "procurement.quote.create",      module: "procurement", description: "Enter vendor quotes" },
        { code: "procurement.quote.update",      module: "procurement", description: "Update quotation details" },
        { code: "procurement.comparison.read",   module: "procurement", description: "View quote comparison" },
        { code: "procurement.comparison.run",    module: "procurement", description: "Run comparison engine" },
        { code: "procurement.vendor.select",     module: "procurement", description: "Select vendor from comparison" },
        { code: "procurement.vendor.final_approve", module: "procurement", description: "Final vendor approval" },
        { code: "procurement.po.read",           module: "procurement", description: "View purchase orders" },
        { code: "procurement.po.create",         module: "procurement", description: "Create purchase orders" },
        { code: "procurement.po.update",         module: "procurement", description: "Update draft POs" },
        { code: "procurement.po.approve",        module: "procurement", description: "Approve purchase orders" },
        { code: "procurement.po.issue",          module: "procurement", description: "Issue PO to vendor" },

        // ── Petty Cash ──────────────────────────────────────────────────────────
        { code: "pettycash.read",                module: "pettycash",   description: "View petty cash requests and expenses" },
        { code: "pettycash.create",              module: "pettycash",   description: "Create petty cash requests" },
        { code: "pettycash.approve",             module: "pettycash",   description: "Approve petty cash requests" },
        { code: "pettycash.expense.create",      module: "pettycash",   description: "Submit petty cash expense bills" },
        { code: "pettycash.expense.verify",      module: "pettycash",   description: "Verify/reject petty cash expense bills" },

        // ── Petrol ──────────────────────────────────────────────────────────────
        { code: "petrol.read",                   module: "petrol",      description: "View petrol expenses" },
        { code: "petrol.create",                 module: "petrol",      description: "Log petrol fill entries" },
        { code: "petrol.verify",                 module: "petrol",      description: "Verify and lock petrol entries" },

        // ── Inventory (Week 5) ───────────────────────────────────────────────────
        { code: "inventory.read",                module: "inventory",   description: "View inventory stock balances" },
        { code: "inventory.store.manage",         module: "inventory",   description: "Create and manage warehouses/stores" },
        { code: "inventory.grn.create",          module: "inventory",   description: "Create goods receipt notes" },
        { code: "inventory.issue.create",        module: "inventory",   description: "Issue materials to site" },
        { code: "inventory.adjust.create",       module: "inventory",   description: "Create stock adjustments" },
        { code: "inventory.adjust.approve",      module: "inventory",   description: "Approve stock adjustments" },
        { code: "inventory.ledger.read",         module: "inventory",   description: "View full stock ledger" },
        { code: "inventory.consume.read",        module: "inventory",   description: "View material consumption records" },

        // ── Finance (Week 6) ─────────────────────────────────────────────────────
        { code: "finance.invoice.read",          module: "finance",     description: "View invoices" },
        { code: "finance.invoice.create",        module: "finance",     description: "Create and record invoices" },
        { code: "finance.invoice.verify",        module: "finance",     description: "Verify invoice for payment" },
        { code: "finance.match.run",             module: "finance",     description: "Run 3-way PO-GRN-Invoice match" },
        { code: "finance.payment.prepare",       module: "finance",     description: "Prepare payment run" },
        { code: "finance.payment.approve",       module: "finance",     description: "Approve payment" },

        // ── Execution Engine (Week 6) ────────────────────────────────────────────
        { code: "execution.read",                module: "execution",   description: "View project execution, DPRs, and dashbaords" },
        { code: "execution.manage",              module: "execution",   description: "Create and manage execution entries (DPR, HSE, Issues)" },
        { code: "execution.approve",             module: "execution",   description: "Final approval for variations, billing, and progress reports" },

        // ── HR / Payroll / Expenses ──────────────────────────────────────────────
        { code: "payroll.read",                  module: "payroll",     description: "View payroll records" },
        { code: "payroll.process",               module: "payroll",     description: "Process payroll run" },
        { code: "expense.read",                  module: "expenses",    description: "View expense records" },
        { code: "expense.create",                module: "expenses",    description: "Submit expense claims" },
        { code: "expense.verify",                module: "expenses",    description: "Verify / approve expenses" },
        { code: "profitshare.read",              module: "profitshare", description: "View profit share rules" },
    ];

    const permissions = {};
    for (const p of allPermissions) {
        permissions[p.code] = await prisma.permission.upsert({
            where: { code: p.code },
            update: { module: p.module, description: p.description },
            create: p
        });
    }
    console.log(`✅ ${Object.keys(permissions).length} permissions seeded.`);

    // ─── ROLES ───────────────────────────────────────────────────────────────────
    console.log("🏛️ Seeding Roles...");
    const roleDefinitions = [
        { code: "super_admin",         name: "Super Admin",          is_system_role: true },
        { code: "erp_admin",           name: "ERP Admin",            is_system_role: true },
        { code: "auditor_readonly",    name: "Auditor (Read-Only)",  is_system_role: false },
        { code: "department_head",     name: "Department Head",      is_system_role: false },
        { code: "project_manager",     name: "Project Manager",      is_system_role: false },
        { code: "site_engineer",       name: "Site Engineer",        is_system_role: false },
        { code: "site_coordinator",    name: "Site Coordinator",     is_system_role: false },
        { code: "procurement_officer", name: "Procurement Officer",  is_system_role: false },
        { code: "accounts_officer",    name: "Accounts Officer",     is_system_role: false },
        { code: "hr_admin",            name: "HR Administrator",     is_system_role: false },
        { code: "storekeeper",         name: "Storekeeper",          is_system_role: false },
        { code: "fleet_coordinator",   name: "Fleet Coordinator",    is_system_role: false },
    ];
    const roles = {};
    for (const r of roleDefinitions) {
        roles[r.code] = await prisma.role.upsert({
            where: { code: r.code },
            update: { name: r.name },
            create: r
        });
    }
    console.log(`✅ ${Object.keys(roles).length} roles seeded.`);

    // ─── ROLE-PERMISSION MATRIX ───────────────────────────────────────────────────
    console.log("🔗 Mapping Role-Permission Matrix...");

    const permCodes = Object.keys(permissions);

    const rolePermMatrix = {
        // Super Admin: ALL permissions
        "super_admin": permCodes,

        // ERP Admin: all business permissions within own company
        "erp_admin": permCodes.filter(p => 
            !["company.create", "company.manage", "dashboard.superadmin", "system.read"].includes(p)
        ).concat(["dashboard.company"]),

        // Auditor: read-only everywhere relevant
        "auditor_readonly": [
            "approval.read", "audit.read", "delegation.read",
            "company.read", "department.read",
            "project.read", "wbs.read", "item.read", "employee.read", "fleet.read", "document.read",
            "vendor.read",
            "procurement.pr.read", "procurement.rfq.read", "procurement.quote.read",
            "procurement.comparison.read", "procurement.po.read",
            "pettycash.read", "petrol.read",
            "inventory.read", "inventory.ledger.read", "inventory.consume.read",
            "finance.invoice.read", "finance.match.run",
            "execution.read",
            "payroll.read", "expense.read", "profitshare.read",
            "user.read", "dashboard.company", "dashboard.project", "dashboard.department", "dashboard.compliance"
        ],

        // Department Head
        "department_head": [
            "approval.read", "approval.approve", "approval.reject",
            "department.read", "project.read", "wbs.read", "item.read",
            "employee.read", "fleet.read", "document.read",
            "vendor.read", "payroll.read", "expense.read", "expense.verify",
            "procurement.pr.read", "procurement.po.read", "pettycash.read",
            "user.read", "dashboard.department"
        ],

        // Project Manager
        "project_manager": [
            "approval.read", "approval.request", "approval.approve", "approval.reject",
            "project.read", "project.access.manage",
            "wbs.read",
            "item.read",
            "procurement.pr.read", "procurement.pr.create", "procurement.pr.update",
            "procurement.pr.submit", "procurement.pr.approve",
            "procurement.rfq.read", "procurement.quote.read",
            "procurement.comparison.read", "procurement.vendor.final_approve",
            "procurement.po.read", "procurement.po.approve",
            "pettycash.read", "pettycash.create", "pettycash.approve",
            "petrol.read", "petrol.create",
            "inventory.read", "inventory.consume.read",
            "finance.invoice.read",
            "expense.read",
            "employee.read", "fleet.read", "vendor.read", "user.read",
            "execution.read", "execution.manage", "execution.approve",
            "dashboard.project"
        ],

        // Site Engineer
        "site_engineer": [
            "approval.read", "approval.request",
            "project.read", "wbs.read", "item.read",
            "procurement.pr.read", "procurement.pr.create",
            "procurement.pr.update", "procurement.pr.submit",
            "pettycash.read", "pettycash.create", "pettycash.expense.create",
            "petrol.read", "petrol.create",
            "fleet.read",
            "inventory.read", "inventory.consume.read",
            "expense.read", "expense.create",
            "execution.read", "execution.manage",
            "dashboard.project",
        ],

        // Site Coordinator (same as site engineer, no RFQ/PO/finance approval)
        "site_coordinator": [
            "approval.read", "approval.request",
            "project.read", "wbs.read", "item.read",
            "procurement.pr.read", "procurement.pr.create",
            "procurement.pr.update", "procurement.pr.submit",
            "pettycash.read", "pettycash.create", "pettycash.expense.create",
            "petrol.read", "petrol.create",
            "fleet.read",
            "inventory.read", "inventory.consume.read",
            "expense.read", "expense.create",
            "dashboard.project",
        ],

        // Procurement Officer
        "procurement_officer": [
            "approval.read",
            "vendor.read", "vendor.create", "vendor.update",
            "procurement.pr.read",
            "procurement.rfq.read", "procurement.rfq.create",
            "procurement.rfq.update", "procurement.rfq.issue",
            "procurement.quote.read", "procurement.quote.create", "procurement.quote.update",
            "procurement.comparison.read", "procurement.comparison.run",
            "procurement.vendor.select",
            "procurement.po.read", "procurement.po.create",
            "procurement.po.update", "procurement.po.issue",
            "item.read", "inventory.read",
        ],

        // Accounts Officer
        "accounts_officer": [
            "approval.read",
            "procurement.pr.read", "procurement.rfq.read",
            "procurement.quote.read", "procurement.comparison.read", "procurement.po.read",
            "pettycash.read", "pettycash.expense.verify",
            "petrol.read", "petrol.verify",
            "finance.invoice.read", "finance.invoice.create", "finance.invoice.verify",
            "finance.match.run", "finance.payment.prepare",
            "expense.read", "expense.verify",
            "payroll.read",
            "vendor.read",
            "inventory.read", "inventory.ledger.read",
        ],

        // HR Admin
        "hr_admin": [
            "employee.read", "employee.create", "employee.update", "employee.archive",
            "document.read", "document.create", "document.update",
            "payroll.read", "payroll.process",
            "user.read", "department.read",
        ],

        // Storekeeper (Week 5 inventory only)
        "storekeeper": [
            "approval.read",
            "item.read",
            "inventory.read", "inventory.grn.create",
            "inventory.issue.create", "inventory.ledger.read", "inventory.consume.read",
            "procurement.po.read", "wbs.read",
        ],

        // Fleet Coordinator
        "fleet_coordinator": [
            "fleet.read", "fleet.create", "fleet.update",
            "petrol.read", "petrol.create",
        ],
    };

    let assocCount = 0;
    const rolePermsData = [];
    for (const [roleCode, permList] of Object.entries(rolePermMatrix)) {
        const roleId = roles[roleCode]?.id;
        if (!roleId) continue;
        for (const permCode of permList) {
            const permId = permissions[permCode]?.id;
            if (!permId) continue;
            rolePermsData.push({ role_id: roleId, permission_id: permId });
            assocCount++;
        }
    }
    await prisma.rolePermission.createMany({ data: rolePermsData });
    console.log(`✅ ${assocCount} role-permission associations mapped.`);

    // ─── PROJECTS ─────────────────────────────────────────────────────────────────
    console.log("🏗️ Seeding Projects...");
    const projects = {};
    const projectsData = [
        { code: "PRJ-NEOM-9",   name: "NEOM Square Infrastructure",  company_id: mainCo.id, status: "active" },
        { code: "PRJ-METRO-7",  name: "Riyadh Metro Extension",      company_id: mainCo.id, status: "active" },
        { code: "PRJ-JEDDAH-3", name: "Jeddah Waterfront Tower",     company_id: mainCo.id, status: "active" },
    ];
    for (const p of projectsData) {
        projects[p.code] = await prisma.project.create({ data: p });
    }

    // ─── WBS & COST CODES ─────────────────────────────────────────────────────────
    console.log("📐 Seeding WBS...");
    const neom = projects["PRJ-NEOM-9"];
    const wbs1 = await prisma.wBS.create({ data: { project_id: neom.id, name: "Site Mobilization" } });
    const wbs2 = await prisma.wBS.create({ data: { project_id: neom.id, name: "Earthworks", parent_id: wbs1.id } });
    await prisma.costCode.createMany({
        data: [
            { wbs_id: wbs1.id, category: "material" },
            { wbs_id: wbs1.id, category: "labor" },
            { wbs_id: wbs2.id, category: "equipment" },
        ]
    });

    // ─── ITEM CATALOG ─────────────────────────────────────────────────────────────
    console.log("📦 Seeding Item Catalog...");
    const itemsData = [
        { name: "Portland Cement (50kg Bag)",        category: "cement",  unit: "BAG",   company_id: mainCo.id },
        { name: "Deformed Steel Bar (12mm)",          category: "steel",   unit: "TON",   company_id: mainCo.id },
        { name: "Diesel Fuel (Ultra Low Sulfur)",     category: "fuel",    unit: "LITER", company_id: mainCo.id },
        { name: "PVC Conduit (20mm)",                 category: "electric",unit: "MTR",   company_id: mainCo.id },
        { name: "Sand (River Washed)",                category: "civil",   unit: "M3",    company_id: mainCo.id },
    ];
    for (const i of itemsData) {
        await prisma.item.create({ data: i });
    }

    // ─── TEST USERS ───────────────────────────────────────────────────────────────
    console.log("👥 Seeding Test Users...");
    const hashedPass = await bcrypt.hash("Password123!", BCRYPT_ROUNDS);

    const usersToCreate = [
        { email: "superadmin@erp.com",    name: "Super Admin",         role: "super_admin",         dept: "DEPT-ADM",  company: mainCo.id },
        { email: "admin@erp.com",         name: "Tariq ERP Admin",     role: "erp_admin",            dept: "DEPT-ADM",  company: mainCo.id },
        { email: "auditor@erp.com",       name: "Nadia Auditor",       role: "auditor_readonly",     dept: "DEPT-FIN",  company: mainCo.id },
        { email: "pm@erp.com",            name: "Ahmed Manager",       role: "project_manager",      dept: "DEPT-CIV",  company: mainCo.id },
        { email: "depthead@erp.com",      name: "Hassan Head",         role: "department_head",      dept: "DEPT-CIV",  company: mainCo.id },
        { email: "engineer@erp.com",      name: "Sara Engineer",       role: "site_engineer",        dept: "DEPT-CIV",  company: mainCo.id },
        { email: "coordinator@erp.com",   name: "Faisal Coordinator",  role: "site_coordinator",     dept: "DEPT-CIV",  company: mainCo.id },
        { email: "procurement@erp.com",   name: "Karim Procurement",   role: "procurement_officer",  dept: "DEPT-PRO",  company: mainCo.id },
        { email: "accounts@erp.com",      name: "Layla Accounts",      role: "accounts_officer",     dept: "DEPT-FIN",  company: mainCo.id },
        { email: "hr@erp.com",            name: "Mona HR",             role: "hr_admin",             dept: "DEPT-ADM",  company: mainCo.id },
        { email: "storekeeper@erp.com",   name: "Omar Store",          role: "storekeeper",          dept: "DEPT-PRO",  company: mainCo.id },
        { email: "fleet@erp.com",         name: "Walid Fleet",         role: "fleet_coordinator",    dept: "DEPT-FLT",  company: mainCo.id },
        // Second company admin (isolation test)
        { email: "admin2@megabuild.com",  name: "MegaBuild Admin",     role: "erp_admin",            dept: null,        company: secondCo.id },
    ];

    const usersCreated = {};
    for (const u of usersToCreate) {
        const userData = {
            email: u.email,
            name: u.name,
            password_hash: hashedPass,
            role_id: roles[u.role].id,
            company_id: u.company,
        };
        if (u.dept) userData.department_id = depts[u.dept].id;
        usersCreated[u.email] = await prisma.user.create({ data: userData });
    }
    console.log(`✅ ${Object.keys(usersCreated).length} users created.`);
    
    // Link Head of Department
    const deptHead = usersCreated["depthead@erp.com"];
    if (deptHead) {
        await prisma.department.update({
            where: { id: depts["DEPT-CIV"].id },
            data: { head_id: deptHead.id }
        });
    }

    // ─── PROJECT ACCESS ASSIGNMENTS ───────────────────────────────────────────────
    console.log("🔑 Assigning Project Access...");
    const pm = usersCreated["pm@erp.com"];
    const engineer = usersCreated["engineer@erp.com"];
    const coordinator = usersCreated["coordinator@erp.com"];
    const procurement = usersCreated["procurement@erp.com"];
    const accounts = usersCreated["accounts@erp.com"];

    await prisma.userProject.createMany({
        data: [
            { user_id: pm.id,          project_id: neom.id,                       access_type: "project_manager" },
            { user_id: pm.id,          project_id: projects["PRJ-METRO-7"].id,    access_type: "project_manager" },
            { user_id: engineer.id,    project_id: neom.id,                       access_type: "site_engineer" },
            { user_id: coordinator.id, project_id: neom.id,                       access_type: "site_coordinator" },
            { user_id: procurement.id, project_id: neom.id,                       access_type: "procurement_officer" },
            { user_id: accounts.id,    project_id: neom.id,                       access_type: "accounts_officer" },
        ]
    });

    // ─── EMPLOYEES ────────────────────────────────────────────────────────────────
    console.log("👷 Seeding Employees...");
    await prisma.employee.createMany({
        data: [
            { name: "John Doe",      designation: "Foreman",     project_id: neom.id, iqama_no: "2100000001", saudization_status: "expat",   company_id: mainCo.id },
            { name: "Khalid Saud",   designation: "Electrician", project_id: neom.id, iqama_no: "1100000002", saudization_status: "citizen", company_id: mainCo.id },
            { name: "Raj Kumar",     designation: "Carpenter",   project_id: neom.id, iqama_no: "2200000003", saudization_status: "expat",   company_id: mainCo.id },
        ]
    });

    // ─── FLEET ────────────────────────────────────────────────────────────────────
    console.log("🚛 Seeding Fleet...");
    await prisma.vehicle.create({
        data: { vehicle_no: "TRUCK-001", plate_no: "ABC-123", running_site: neom.id, department: "DEPT-PRO", company_id: mainCo.id }
    });
    await prisma.vehicle.create({
        data: { vehicle_no: "VAN-002",   plate_no: "XYZ-456", running_site: neom.id, department: "DEPT-FLT", company_id: mainCo.id }
    });
    await prisma.equipment.create({
        data: { equipment_no: "EXCAV-001", name: "Cat Excavator 320", running_site: neom.id, status: "active", company_id: mainCo.id }
    });

    // ─── COMPLIANCE DOCUMENTS ─────────────────────────────────────────────────────
    console.log("📜 Seeding Compliance Documents...");
    await prisma.companyDocument.create({
        data: {
            company_id: mainCo.id,
            type: "Commercial Registration (CR)",
            document_number: "1010000001",
            issue_date: new Date("2024-01-01"),
            expiry_date: new Date("2026-06-01"),
        }
    });
    await prisma.companyDocument.create({
        data: {
            company_id: mainCo.id,
            type: "VAT Certificate",
            document_number: "300000000000003",
            issue_date: new Date("2024-01-01"),
            expiry_date: new Date("2025-12-31"),
        }
    });

    // ─── VENDORS ──────────────────────────────────────────────────────────────────
    console.log("🏭 Seeding Vendors...");
    const vendors = {};
    const vendorsData = [
        { name: "Al-Riyadh Steel Co.",       email: "sales@alriyadhsteel.sa",  phone: "+966-11-2345678", category: "steel",     company_id: mainCo.id, status: "active",  department_id: depts["DEPT-PRO"].id },
        { name: "Saudi Cement Suppliers",    email: "info@saudicementsup.sa",  phone: "+966-12-3456789", category: "cement",    company_id: mainCo.id, status: "active",  department_id: depts["DEPT-PRO"].id },
        { name: "National Fuel Distributors",email: "fuel@nationalfuel.sa",    phone: "+966-13-4567890", category: "fuel",      company_id: mainCo.id, status: "pending", department_id: depts["DEPT-PRO"].id },
    ];
    for (const v of vendorsData) {
        vendors[v.name] = await prisma.vendor.create({ data: v });
    }

    // ─── APPROVAL MATRIX ──────────────────────────────────────────────────────────
    console.log("📋 Seeding Approval Matrix...");
    // PR approval: Site Engineer → Project Manager → ERP Admin 
    await prisma.approvalMatrix.create({
        data: {
            company_id: mainCo.id,
            doc_type: "PR",
            step_order: 1,
            role_id: roles["project_manager"].id,
            min_amount: 0,
        }
    });
    // Petty Cash approval: PM
    await prisma.approvalMatrix.create({
        data: {
            company_id: mainCo.id,
            doc_type: "PETTY_CASH",
            step_order: 1,
            role_id: roles["project_manager"].id,
            min_amount: 0,
        }
    });
    // PO approval: PM first, ERP Admin if >100k
    await prisma.approvalMatrix.create({
        data: {
            company_id: mainCo.id,
            doc_type: "PO",
            step_order: 1,
            role_id: roles["project_manager"].id,
            min_amount: 0,
        }
    });

    // ─── SAMPLE PR (for testing) ──────────────────────────────────────────────────
    console.log("📥 Seeding Sample Purchase Requisition...");
    const sampleItem = await prisma.item.findFirst({ where: { company_id: mainCo.id } });
    if (sampleItem) {
        await prisma.purchaseRequisition.create({
            data: {
                pr_no: "PR-2024-0001",
                project_id: neom.id,
                requested_by: engineer.id,
                company_id: mainCo.id,
                status: "submitted",
                reason: "Urgent cement supply needed for NEOM foundation work",
                items: {
                    create: [
                        { item_id: sampleItem.id, quantity: 500, remarks: "Needs to be delivered ASAP" },
                    ]
                }
            }
        });
    }

    // ─── SUMMARY ──────────────────────────────────────────────────────────────────
    console.log("\n" + "═".repeat(60));
    console.log("🎉 Enterprise RBAC Seed Complete!");
    console.log("═".repeat(60));
    console.log("\n📊 Summary:");
    console.log(`  Companies:    2`);
    console.log(`  Departments:  ${Object.keys(depts).length}`);
    console.log(`  Roles:        ${Object.keys(roles).length}`);
    console.log(`  Permissions:  ${Object.keys(permissions).length}`);
    console.log(`  Users:        ${Object.keys(usersCreated).length}`);
    console.log(`  Projects:     ${Object.keys(projects).length}`);
    console.log("\n🔑 Test Credentials (all use: Password123!)");
    console.log("  superadmin@erp.com    → super_admin");
    console.log("  admin@erp.com         → erp_admin");
    console.log("  auditor@erp.com       → auditor_readonly");
    console.log("  pm@erp.com            → project_manager");
    console.log("  depthead@erp.com      → department_head");
    console.log("  engineer@erp.com      → site_engineer");
    console.log("  coordinator@erp.com   → site_coordinator");
    console.log("  procurement@erp.com   → procurement_officer");
    console.log("  accounts@erp.com      → accounts_officer");
    console.log("  hr@erp.com            → hr_admin");
    console.log("  storekeeper@erp.com   → storekeeper");
    console.log("  fleet@erp.com         → fleet_coordinator");
    console.log("  admin2@megabuild.com  → erp_admin (MegaBuild Co. - isolation test)");
    console.log("═".repeat(60));
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
