"use strict";

/**
 * seed_wbs_items.js  —  Comprehensive, fully idempotent setup seed
 *
 * Safely (re-)runs on any database state without creating duplicates.
 * Handles:
 *   1. Permissions  — upserts all required permission codes
 *   2. Roles        — upserts all system/business roles
 *   3. Role-Permission matrix — adds any missing assignments (no duplicates)
 *   4. WBS nodes    — creates the default 5-phase structure for every
 *                     active project that currently has ZERO WBS nodes
 *   5. Item catalog — creates 12 standard construction items for every
 *                     company that currently has NO items
 *
 * Run from repo root:
 *   node Server/prisma/seed_wbs_items.js
 *
 * Requires DATABASE_URL in env (loaded from Server/.env automatically).
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─────────────────────────────────────────────────────────────────────────────
// 1. PERMISSION CATALOG
// ─────────────────────────────────────────────────────────────────────────────

const ALL_PERMISSIONS = [
    // Projects / WBS
    { code: "project.read",             module: "projects",     description: "View projects" },
    { code: "project.create",           module: "projects",     description: "Create new projects" },
    { code: "project.update",           module: "projects",     description: "Update project details" },
    { code: "project.archive",          module: "projects",     description: "Archive / close projects" },
    { code: "project.access.manage",    module: "projects",     description: "Manage project user assignments" },
    { code: "wbs.read",                 module: "wbs",          description: "View WBS structures" },
    { code: "wbs.create",               module: "wbs",          description: "Create WBS nodes and cost codes" },
    { code: "wbs.update",               module: "wbs",          description: "Update WBS and budgets" },
    { code: "wbs.archive",              module: "wbs",          description: "Archive WBS entries" },
    // Items / Master data
    { code: "item.read",                module: "items",        description: "View item catalog" },
    { code: "item.create",              module: "items",        description: "Create catalog items" },
    { code: "item.update",              module: "items",        description: "Update catalog items" },
    { code: "employee.read",            module: "employees",    description: "View employee records" },
    { code: "fleet.read",               module: "fleet",        description: "View vehicles and equipment" },
    { code: "document.read",            module: "documents",    description: "View compliance documents" },
    { code: "vendor.read",              module: "vendors",      description: "View vendor directory" },
    { code: "vendor.create",            module: "vendors",      description: "Register new vendors" },
    { code: "vendor.update",            module: "vendors",      description: "Update and manage vendor lifecycle" },
    // Procurement
    { code: "procurement.pr.read",      module: "procurement",  description: "View purchase requisitions" },
    { code: "procurement.pr.create",    module: "procurement",  description: "Create purchase requisitions" },
    { code: "procurement.pr.update",    module: "procurement",  description: "Update draft PRs" },
    { code: "procurement.pr.submit",    module: "procurement",  description: "Submit PRs for approval" },
    { code: "procurement.pr.approve",   module: "procurement",  description: "Approve purchase requisitions" },
    { code: "procurement.rfq.read",     module: "procurement",  description: "View RFQs" },
    { code: "procurement.rfq.create",   module: "procurement",  description: "Create RFQs" },
    { code: "procurement.rfq.update",   module: "procurement",  description: "Update RFQ details" },
    { code: "procurement.rfq.issue",    module: "procurement",  description: "Issue RFQ to vendors" },
    { code: "procurement.quote.read",   module: "procurement",  description: "View vendor quotations" },
    { code: "procurement.po.read",      module: "procurement",  description: "View purchase orders" },
    { code: "procurement.po.create",    module: "procurement",  description: "Create purchase orders" },
    { code: "procurement.po.approve",   module: "procurement",  description: "Approve purchase orders" },
    { code: "procurement.po.issue",     module: "procurement",  description: "Issue PO to vendor" },
    // Inventory
    { code: "inventory.read",           module: "inventory",    description: "View inventory stock balances" },
    { code: "inventory.grn.create",     module: "inventory",    description: "Create goods receipt notes" },
    { code: "inventory.ledger.read",    module: "inventory",    description: "View full stock ledger" },
    { code: "inventory.consume.read",   module: "inventory",    description: "View material consumption records" },
    // Execution
    { code: "execution.read",           module: "execution",    description: "View project execution and DPRs" },
    { code: "execution.manage",         module: "execution",    description: "Create and manage DPR/HSE entries" },
    { code: "execution.approve",        module: "execution",    description: "Final approval for variations and reports" },
    // Finance / petty cash / petrol
    { code: "pettycash.read",           module: "pettycash",    description: "View petty cash requests" },
    { code: "pettycash.create",         module: "pettycash",    description: "Create petty cash requests" },
    { code: "pettycash.approve",        module: "pettycash",    description: "Approve petty cash requests" },
    { code: "pettycash.expense.create", module: "pettycash",    description: "Submit petty cash expense bills" },
    { code: "petrol.read",              module: "petrol",       description: "View petrol expenses" },
    { code: "petrol.create",            module: "petrol",       description: "Log petrol fill entries" },
    { code: "expense.read",             module: "expenses",     description: "View expense records" },
    { code: "expense.create",           module: "expenses",     description: "Submit expense claims" },
    { code: "finance.invoice.read",     module: "finance",      description: "View invoices" },
    { code: "payroll.read",             module: "payroll",      description: "View payroll records" },
    // Approvals / system
    { code: "approval.read",            module: "approvals",    description: "View approval inbox" },
    { code: "approval.request",         module: "approvals",    description: "Request approvals" },
    { code: "approval.approve",         module: "approvals",    description: "Approve requests" },
    { code: "approval.reject",          module: "approvals",    description: "Reject requests" },
    { code: "user.read",                module: "system",       description: "View user accounts" },
    { code: "department.read",          module: "system",       description: "View department list" },
    { code: "company.read",             module: "companies",    description: "View company records" },
    { code: "dashboard.company",        module: "dashboard",    description: "Company-level dashboard" },
    { code: "dashboard.project",        module: "dashboard",    description: "Project-level operational dashboard" },
    { code: "dashboard.compliance",     module: "dashboard",    description: "Compliance and expiry dashboard" },
    { code: "dashboard.department",     module: "dashboard",    description: "Department-level metrics dashboard" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. ROLES
// ─────────────────────────────────────────────────────────────────────────────

const ALL_ROLES = [
    { code: "super_admin",         name: "Super Admin",           is_system_role: true  },
    { code: "erp_admin",           name: "ERP Admin",             is_system_role: true  },
    { code: "auditor_readonly",    name: "Auditor (Read-Only)",   is_system_role: false },
    { code: "department_head",     name: "Department Head",       is_system_role: false },
    { code: "project_manager",     name: "Project Manager",       is_system_role: false },
    { code: "site_engineer",       name: "Site Engineer",         is_system_role: false },
    { code: "site_coordinator",    name: "Site Coordinator",      is_system_role: false },
    { code: "procurement_officer", name: "Procurement Officer",   is_system_role: false },
    { code: "accounts_officer",    name: "Accounts Officer",      is_system_role: false },
    { code: "hr_admin",            name: "HR Administrator",      is_system_role: false },
    { code: "storekeeper",         name: "Storekeeper",           is_system_role: false },
    { code: "fleet_coordinator",   name: "Fleet Coordinator",     is_system_role: false },
    { code: "hr_manager",          name: "Global HR Manager",     is_system_role: false },
    { code: "procurement_manager", name: "Procurement Manager",   is_system_role: false },
    { code: "accounts_manager",    name: "Accounts Manager",      is_system_role: false },
    { code: "sales_manager",       name: "Sales Manager",         is_system_role: false },
    { code: "qc_inspector",        name: "QC Inspector",          is_system_role: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROLE → PERMISSION MATRIX
//    project_manager and site_engineer now include wbs.create/update/archive
//    so they can manage their own project's WBS structure (required for DPR/PR)
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_PERM_MATRIX = {
    super_admin: null, // null = ALL permissions

    erp_admin: null,   // null = ALL permissions

    auditor_readonly: [
        "approval.read", "company.read", "department.read",
        "project.read", "wbs.read", "item.read", "employee.read", "fleet.read", "document.read",
        "vendor.read",
        "procurement.pr.read", "procurement.rfq.read", "procurement.quote.read", "procurement.po.read",
        "pettycash.read", "petrol.read",
        "inventory.read", "inventory.ledger.read", "inventory.consume.read",
        "finance.invoice.read",
        "execution.read",
        "payroll.read", "expense.read",
        "user.read", "dashboard.company", "dashboard.project", "dashboard.compliance"
    ],

    department_head: [
        "approval.read", "approval.approve", "approval.reject",
        "department.read", "project.read", "wbs.read", "item.read",
        "employee.read", "fleet.read", "document.read",
        "vendor.read", "payroll.read", "expense.read",
        "procurement.pr.read", "procurement.po.read", "pettycash.read",
        "user.read", "dashboard.department", "dashboard.compliance"
    ],

    // Project managers can now create/update WBS nodes for their own projects
    project_manager: [
        "approval.read", "approval.request", "approval.approve", "approval.reject",
        "project.read", "project.access.manage",
        "wbs.read", "wbs.create", "wbs.update", "wbs.archive",
        "item.read",
        "procurement.pr.read", "procurement.pr.create", "procurement.pr.update",
        "procurement.pr.submit", "procurement.pr.approve",
        "procurement.rfq.read", "procurement.quote.read",
        "procurement.po.read", "procurement.po.approve",
        "pettycash.read", "pettycash.create", "pettycash.approve",
        "petrol.read", "petrol.create",
        "inventory.read", "inventory.consume.read",
        "finance.invoice.read",
        "expense.read",
        "employee.read", "fleet.read", "vendor.read", "user.read",
        "execution.read", "execution.manage", "execution.approve",
        "dashboard.project", "dashboard.compliance"
    ],

    // Site engineers can also create WBS so DPR/PR flow works
    site_engineer: [
        "approval.read", "approval.request",
        "project.read",
        "wbs.read", "wbs.create", "wbs.update",
        "item.read",
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

    site_coordinator: [
        "approval.read", "approval.request",
        "project.read", "wbs.read", "wbs.create", "wbs.update",
        "item.read",
        "procurement.pr.read", "procurement.pr.create",
        "procurement.pr.update", "procurement.pr.submit",
        "pettycash.read", "pettycash.create", "pettycash.expense.create",
        "petrol.read", "petrol.create",
        "fleet.read",
        "inventory.read", "inventory.consume.read",
        "expense.read", "expense.create",
        "dashboard.project",
    ],

    procurement_officer: [
        "approval.read",
        "vendor.read", "vendor.create", "vendor.update",
        "procurement.pr.read",
        "procurement.rfq.read", "procurement.rfq.create",
        "procurement.rfq.update", "procurement.rfq.issue",
        "procurement.quote.read",
        "procurement.po.read", "procurement.po.create",
        "procurement.po.approve", "procurement.po.issue",
        "item.read", "inventory.read",
    ],

    accounts_officer: [
        "approval.read",
        "procurement.pr.read", "procurement.rfq.read", "procurement.quote.read", "procurement.po.read",
        "pettycash.read",
        "petrol.read",
        "finance.invoice.read",
        "expense.read",
        "payroll.read",
        "vendor.read",
        "inventory.read", "inventory.ledger.read", "item.read", "inventory.grn.create", "project.read",
    ],

    hr_admin: [
        "employee.read", "document.read", "document.create",
        "payroll.read",
        "user.read",
        "vendor.read",
        "fleet.read",
        "project.read", "company.read", "department.read",
        "dashboard.company", "dashboard.compliance",
    ],

    storekeeper: [
        "approval.read", "item.read",
        "inventory.read", "inventory.grn.create",
        "inventory.ledger.read", "inventory.consume.read",
        "procurement.po.read", "wbs.read",
    ],

    fleet_coordinator: [
        "fleet.read", "petrol.read", "petrol.create", "project.read",
    ],

    hr_manager: [
        "approval.read",
        "employee.read", "document.read",
        "payroll.read",
        "expense.read",
        "dashboard.company", "dashboard.department", "dashboard.compliance"
    ],

    procurement_manager: [
        "approval.read",
        "procurement.pr.read", "procurement.rfq.read", "procurement.quote.read", "procurement.po.read",
        "vendor.read", "inventory.read", "item.read",
        "dashboard.company"
    ],

    accounts_manager: [
        "approval.read",
        "pettycash.read", "pettycash.approve",
        "petrol.read",
        "finance.invoice.read",
        "expense.read",
        "payroll.read",
        "inventory.ledger.read",
        "execution.read",
        "dashboard.company"
    ],

    sales_manager: [
        "approval.read",
        "project.read", "wbs.read",
        "dashboard.company", "dashboard.project"
    ],

    qc_inspector: [
        "execution.read", "project.read", "wbs.read",
        "dashboard.project",
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. DEFAULT WBS STRUCTURE (5 standard construction phases)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WBS_STRUCTURE = [
    { name: "Site Mobilization",          wbs_code: "1",   children: [] },
    { name: "Earthworks & Substructure",  wbs_code: "2",   children: [
        { name: "Excavation",             wbs_code: "2.1" },
        { name: "Foundation Works",       wbs_code: "2.2" },
    ]},
    { name: "Structural Works",           wbs_code: "3",   children: [
        { name: "Concrete Works",         wbs_code: "3.1" },
        { name: "Steel Erection",         wbs_code: "3.2" },
    ]},
    { name: "MEP Works",                  wbs_code: "4",   children: [] },
    { name: "Finishing & Handover",       wbs_code: "5",   children: [] },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. DEFAULT ITEM CATALOG (12 standard construction materials)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_ITEMS = [
    { name: "Portland Cement (50kg Bag)",    category: "cement",   unit: "BAG",   standard_price: 45 },
    { name: "Deformed Steel Bar (12mm)",      category: "steel",    unit: "TON",   standard_price: 3200 },
    { name: "River Sand (Washed)",            category: "civil",    unit: "M3",    standard_price: 120 },
    { name: "Coarse Aggregate (20mm)",        category: "civil",    unit: "M3",    standard_price: 150 },
    { name: "Ready-Mix Concrete (C25)",       category: "concrete", unit: "M3",    standard_price: 420 },
    { name: "Structural Steel Section",       category: "steel",    unit: "TON",   standard_price: 3800 },
    { name: "Diesel Fuel (ULSD)",             category: "fuel",     unit: "LITER", standard_price: 1.85 },
    { name: "PVC Conduit (20mm x 3m)",        category: "electric", unit: "PCS",   standard_price: 8 },
    { name: "Hollow Block (20cm)",            category: "masonry",  unit: "PCS",   standard_price: 3.5 },
    { name: "Waterproofing Membrane (4mm)",   category: "civil",    unit: "M2",    standard_price: 55 },
    { name: "Safety Helmet",                  category: "safety",   unit: "PCS",   standard_price: 25 },
    { name: "Safety Gloves (Pair)",           category: "safety",   unit: "PCS",   standard_price: 6 },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function upsertPermissions() {
    console.log("🔑  Upserting permissions...");
    const permMap = {};
    for (const p of ALL_PERMISSIONS) {
        const rec = await prisma.permission.upsert({
            where: { code: p.code },
            update: { module: p.module, description: p.description },
            create: p,
        });
        permMap[p.code] = rec;
    }
    console.log(`   ✅  ${ALL_PERMISSIONS.length} permissions ensured.`);
    return permMap;
}

async function upsertRoles() {
    console.log("🏛️   Upserting roles...");
    const roleMap = {};
    for (const r of ALL_ROLES) {
        const rec = await prisma.role.upsert({
            where: { code: r.code },
            update: { name: r.name },
            create: r,
        });
        roleMap[r.code] = rec;
    }
    console.log(`   ✅  ${ALL_ROLES.length} roles ensured.`);
    return roleMap;
}

async function ensureRolePermissions(roleMap, permMap) {
    console.log("🔗  Ensuring role-permission assignments...");

    // Build a set of existing (role_id, permission_id) pairs to avoid duplicates
    const existing = await prisma.rolePermission.findMany({
        select: { role_id: true, permission_id: true }
    });
    const existingSet = new Set(existing.map(r => `${r.role_id}:${r.permission_id}`));

    const allPermIds = Object.values(permMap).map(p => p.id);
    const toCreate = [];

    for (const [roleCode, permList] of Object.entries(ROLE_PERM_MATRIX)) {
        const role = roleMap[roleCode];
        if (!role) continue;

        // null = grant ALL permissions
        const grantCodes = permList === null
            ? Object.keys(permMap)
            : permList;

        for (const code of grantCodes) {
            const perm = permMap[code];
            if (!perm) continue;
            const key = `${role.id}:${perm.id}`;
            if (!existingSet.has(key)) {
                toCreate.push({ role_id: role.id, permission_id: perm.id });
                existingSet.add(key); // prevent duplicates within this batch
            }
        }
    }

    if (toCreate.length) {
        await prisma.rolePermission.createMany({ data: toCreate });
    }
    console.log(`   ✅  ${toCreate.length} new role-permission assignments added.`);
}

async function seedWBSForProject(projectId, projectCode) {
    let seeded = 0;
    for (const rootDef of DEFAULT_WBS_STRUCTURE) {
        const root = await prisma.wBS.create({
            data: {
                project_id: projectId,
                name: rootDef.name,
                wbs_code: rootDef.wbs_code,
            }
        });
        seeded++;
        for (const child of (rootDef.children || [])) {
            await prisma.wBS.create({
                data: {
                    project_id: projectId,
                    name: child.name,
                    wbs_code: child.wbs_code,
                    parent_id: root.id,
                }
            });
            seeded++;
        }
    }
    console.log(`   ✅  ${projectCode}: ${seeded} WBS nodes created.`);
    return seeded;
}

async function seedWBS() {
    console.log("📐  Seeding WBS nodes for projects without any...");
    const activeProjects = await prisma.project.findMany({
        where: { status: "active" },
        include: { _count: { select: { wbs: true } } },
        orderBy: { created_at: "asc" },
    });

    if (!activeProjects.length) {
        console.log("   ⚠️  No active projects found — skipping WBS seed.");
        return;
    }

    let seededCount = 0;
    for (const project of activeProjects) {
        if (project._count.wbs > 0) {
            console.log(`   ⏭  ${project.code}: already has ${project._count.wbs} WBS node(s) — skipping.`);
        } else {
            await seedWBSForProject(project.id, project.code || project.name);
            seededCount++;
        }
    }
    if (seededCount === 0) console.log("   ℹ️  All projects already have WBS nodes.");
}

async function seedItems() {
    console.log("📦  Seeding item catalog per company...");
    const companies = await prisma.company.findMany({ select: { id: true, name: true } });

    if (!companies.length) {
        console.log("   ⚠️  No companies found — skipping item seed.");
        return;
    }

    for (const company of companies) {
        const existingCount = await prisma.item.count({ where: { company_id: company.id } });
        if (existingCount > 0) {
            console.log(`   ⏭  ${company.name}: already has ${existingCount} item(s) — skipping.`);
            continue;
        }
        for (const item of DEFAULT_ITEMS) {
            await prisma.item.create({ data: { ...item, company_id: company.id } });
        }
        console.log(`   ✅  ${company.name}: ${DEFAULT_ITEMS.length} catalog items created.`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log("\n🚀  seed_wbs_items — comprehensive idempotent setup\n");

    const permMap  = await upsertPermissions();
    const roleMap  = await upsertRoles();
    await ensureRolePermissions(roleMap, permMap);
    await seedWBS();
    await seedItems();

    console.log("\n✅  All done.\n");
    console.log("👉  Next steps:");
    console.log("    - Log in as erp_admin (admin@erp.com / Password123!) and navigate to Project WBS");
    console.log("    - The 'Auto-Seed WBS for All Projects' button is also available in the WBS page");
    console.log("    - Add items to the Item Catalog (Master Resources → Item Catalog) if needed\n");
}

main()
    .catch(e => {
        console.error("\n❌  Seed failed:", e.message);
        if (e.message.includes("connect")) {
            console.error("    Check that DATABASE_URL in Server/.env is correct and the DB is reachable.");
        }
        process.exit(1);
    })
    .finally(() => pool.end());
