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

// ─── STEP 1: CLEAR ALL DATA ───────────────────────────────────────────────────
async function clearAllData() {
    console.log("🧹 Clearing ALL existing data from all schemas (full reset)...");

    // Schemas to clear
    const schemas = ["public", "auth", "audit", "hr", "procurement", "inventory", "finance", "execution"];

    for (const schema of schemas) {
        try {
            const result = await prisma.$queryRawUnsafe(`
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = '${schema}' AND table_type = 'BASE TABLE'
            `);
            const tables = result.map(t => `"${schema}"."${t.table_name}"`);
            if (tables.length > 0) {
                await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
                console.log(`  ✅ Schema '${schema}': ${tables.length} tables truncated.`);
            }
        } catch (err) {
            // Schema may not exist — skip silently
            console.log(`  ⚠️  Schema '${schema}' skipped: ${err.message.split("\n")[0]}`);
        }
    }

    console.log("✅ All data cleared.\n");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log("🚀 Starting Minimal Seed: SuperAdmin + Permissions + Roles...\n");

    // STEP 1: Wipe everything
    await clearAllData();

    // ─── PERMISSIONS ─────────────────────────────────────────────────────────
    console.log("🔐 Seeding all Permissions...");

    const allPermissions = [
        // ── Governance / Admin ──────────────────────────────────────────────
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

        // ── Projects / WBS ──────────────────────────────────────────────────
        { code: "project.read",           module: "projects",     description: "View projects" },
        { code: "project.create",         module: "projects",     description: "Create new projects" },
        { code: "project.update",         module: "projects",     description: "Update project details" },
        { code: "project.archive",        module: "projects",     description: "Archive / close projects" },
        { code: "project.access.manage",  module: "projects",     description: "Manage project user assignments" },
        { code: "wbs.read",               module: "wbs",          description: "View WBS structures" },
        { code: "wbs.create",             module: "wbs",          description: "Create WBS nodes and cost codes" },
        { code: "wbs.update",             module: "wbs",          description: "Update WBS and budgets" },
        { code: "wbs.archive",            module: "wbs",          description: "Archive WBS entries" },

        // ── Master Data ─────────────────────────────────────────────────────
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

        // ── Vendors ─────────────────────────────────────────────────────────
        { code: "vendor.read",            module: "vendors",      description: "View vendor directory" },
        { code: "vendor.create",          module: "vendors",      description: "Register new vendors" },
        { code: "vendor.update",          module: "vendors",      description: "Update and manage vendor lifecycle" },
        { code: "vendor.approve",         module: "vendors",      description: "Approve/activate/suspend vendors" },

        // ── Procurement ─────────────────────────────────────────────────────
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

        // ── Petty Cash ──────────────────────────────────────────────────────
        { code: "pettycash.read",                module: "pettycash",   description: "View petty cash requests and expenses" },
        { code: "pettycash.create",              module: "pettycash",   description: "Create petty cash requests" },
        { code: "pettycash.approve",             module: "pettycash",   description: "Approve petty cash requests" },
        { code: "pettycash.expense.create",      module: "pettycash",   description: "Submit petty cash expense bills" },
        { code: "pettycash.expense.verify",      module: "pettycash",   description: "Verify/reject petty cash expense bills" },

        // ── Petrol ──────────────────────────────────────────────────────────
        { code: "petrol.read",                   module: "petrol",      description: "View petrol expenses" },
        { code: "petrol.create",                 module: "petrol",      description: "Log petrol fill entries" },
        { code: "petrol.verify",                 module: "petrol",      description: "Verify and lock petrol entries" },

        // ── Inventory ───────────────────────────────────────────────────────
        { code: "inventory.read",                module: "inventory",   description: "View inventory stock balances" },
        { code: "inventory.store.manage",         module: "inventory",   description: "Create and manage warehouses/stores" },
        { code: "inventory.grn.create",          module: "inventory",   description: "Create goods receipt notes" },
        { code: "inventory.issue.create",        module: "inventory",   description: "Issue materials to site" },
        { code: "inventory.adjust.create",       module: "inventory",   description: "Create stock adjustments" },
        { code: "inventory.adjust.approve",      module: "inventory",   description: "Approve stock adjustments" },
        { code: "inventory.ledger.read",         module: "inventory",   description: "View full stock ledger" },
        { code: "inventory.consume.read",        module: "inventory",   description: "View material consumption records" },

        // ── Finance ─────────────────────────────────────────────────────────
        { code: "finance.invoice.read",          module: "finance",     description: "View invoices" },
        { code: "finance.invoice.create",        module: "finance",     description: "Create and record invoices" },
        { code: "finance.invoice.verify",        module: "finance",     description: "Verify invoice for payment" },
        { code: "finance.match.run",             module: "finance",     description: "Run 3-way PO-GRN-Invoice match" },
        { code: "finance.payment.prepare",       module: "finance",     description: "Prepare payment run" },
        { code: "finance.payment.approve",       module: "finance",     description: "Approve payment" },

        // ── Execution Engine ────────────────────────────────────────────────
        { code: "execution.read",                module: "execution",   description: "View project execution, DPRs, and dashboards" },
        { code: "execution.manage",              module: "execution",   description: "Create and manage execution entries (DPR, HSE, Issues)" },
        { code: "execution.approve",             module: "execution",   description: "Final approval for variations, billing, and progress reports" },

        // ── HR / Payroll / Expenses ──────────────────────────────────────────
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
    console.log(`✅ ${Object.keys(permissions).length} permissions seeded.\n`);

    // ─── ROLES ───────────────────────────────────────────────────────────────
    console.log("🏛️  Seeding all Roles...");
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
    console.log(`✅ ${Object.keys(roles).length} roles seeded.\n`);

    // ─── ROLE-PERMISSION MATRIX ──────────────────────────────────────────────
    console.log("🔗 Mapping Role-Permission Matrix...");
    const permCodes = Object.keys(permissions);

    const rolePermMatrix = {
        // Super Admin: ALL permissions
        "super_admin": permCodes,

        // ERP Admin: all except cross-company/superadmin privileges
        "erp_admin": permCodes.filter(p =>
            !["company.create", "company.manage", "dashboard.superadmin", "system.read"].includes(p)
        ).concat(["dashboard.company"]),

        // Auditor: read-only
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

        // Site Coordinator
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

        // Storekeeper
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

    const rolePermsData = [];
    let assocCount = 0;
    for (const [roleCode, permList] of Object.entries(rolePermMatrix)) {
        const roleId = roles[roleCode]?.id;
        if (!roleId) continue;
        // Deduplicate permList
        const uniquePerms = [...new Set(permList)];
        for (const permCode of uniquePerms) {
            const permId = permissions[permCode]?.id;
            if (!permId) continue;
            rolePermsData.push({ role_id: roleId, permission_id: permId });
            assocCount++;
        }
    }
    await prisma.rolePermission.createMany({ data: rolePermsData });
    console.log(`✅ ${assocCount} role-permission associations mapped.\n`);

    // ─── SUPERADMIN USER ─────────────────────────────────────────────────────
    console.log("👤 Creating SuperAdmin user...");
    const hashedPass = await bcrypt.hash("Password123!", BCRYPT_ROUNDS);

    // SuperAdmin has no company_id (system-level)
    const superAdmin = await prisma.user.create({
        data: {
            email: "superadmin@erp.com",
            name: "Super Admin",
            password_hash: hashedPass,
            role_id: roles["super_admin"].id,
            // No company_id — superadmin is cross-company
        }
    });
    console.log(`✅ SuperAdmin created: ${superAdmin.email} (id: ${superAdmin.id})\n`);

    // ─── SUMMARY ─────────────────────────────────────────────────────────────
    console.log("═".repeat(60));
    console.log("🎉 Minimal Seed Complete!");
    console.log("═".repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`  Permissions:  ${Object.keys(permissions).length}`);
    console.log(`  Roles:        ${Object.keys(roles).length}`);
    console.log(`  Users:        1 (superadmin only)`);
    console.log(`\n🔑 Login Credentials:`);
    console.log(`  Email:    superadmin@erp.com`);
    console.log(`  Password: Password123!`);
    console.log(`  Role:     super_admin (ALL permissions)`);
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
