"use strict";

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;

async function main() {
    console.log("🚀 Starting Enterprise Master Data Seeding (Week 3)...");

    // 1. CLEAR PREVIOUS DATA (Dependencies first)
    console.log("🧹 Clearing existing data using TRUNCATE CASCADE...");
    
    const tables = [
        '"audit"."audit_logs"', '"audit"."system_logs"', '"audit"."idempotency_keys"',
        '"auth"."approval_steps"', '"auth"."approval_request_items"', '"auth"."approval_requests"', '"auth"."approval_matrices"', '"auth"."approval_delegations"',
        '"auth"."user_sessions"', '"auth"."password_resets"', '"auth"."user_projects"',
        '"auth"."petrol_expenses"', '"auth"."petty_cash_expenses"', '"auth"."petty_cash_requests"',
        '"auth"."vendor_quote_items"', '"auth"."vendor_quotes"', '"auth"."rfq_vendors"', '"auth"."rfqs"', '"auth"."comparison_engines"',
        '"auth"."purchase_requisition_items"', '"auth"."pr_approvals"', '"auth"."purchase_requisitions"',
        '"auth"."purchase_order_items"', '"auth"."purchase_orders"', '"auth"."quotations"', '"auth"."expenses"',
        '"auth"."project_progress"', '"auth"."employees"', '"auth"."vehicles"', '"auth"."equipment"',
        '"auth"."company_documents"', '"auth"."facility_documents"', '"auth"."projects"',
        '"auth"."items"', '"auth"."cost_codes"', '"auth"."wbs"',
        '"auth"."users"', '"auth"."departments"', '"auth"."role_permissions"', '"auth"."permissions"', '"auth"."roles"', '"auth"."companies"'
    ];
    try {
        console.log("🛠️ Running Atomic Truncate...");
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(', ')} CASCADE;`);
        console.log("✨ Truncate successful.");
        
        const count = await prisma.company.count();
        console.log(`📉 Verified Company Count: ${count}`);
    } catch (err) {
        console.log("❌ Global truncate error:", err.message);
        // Fallback to loop if atomic fails
        for (const table of tables) {
            try { await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${table} CASCADE;`); } catch (e) {}
        }
    }

    // 2. SEED COMPANIES
    console.log("🏢 Seeding Companies...");
    const companies = {};
    const companiesData = [
        { code: "ANT-CONS", name: "Antigravity Construction", email: "info@antigravity.sa", address: "Riyadh Digital City" },
        { code: "MB-CORP", name: "MegaBuild Corp", email: "contact@megabuild.sa", address: "Jeddah Industrial Gate" }
    ];
    for (const c of companiesData) {
        companies[c.code] = await prisma.company.upsert({
            where: { code: c.code },
            update: c,
            create: c
        });
    }

    const mainCo = companies["ANT-CONS"];

    // 3. SEED DEPARTMENTS
    console.log("📂 Seeding Departments...");
    const depts = {};
    const deptsData = [
        { code: "DEPT-CIV", name: "Civil Engineering", company_id: mainCo.id },
        { code: "DEPT-MEP", name: "MEP & Electrical", company_id: mainCo.id },
        { code: "DEPT-PRO", name: "Procurement & Logistics", company_id: mainCo.id },
        { code: "DEPT-ADM", name: "Administration & HR", company_id: mainCo.id }
    ];
    for (const d of deptsData) {
        depts[d.code] = await prisma.department.upsert({
            where: { code: d.code },
            update: d,
            create: d
        });
    }

    // 4. SEED PERMISSIONS (Harmonized with Router Requirements)
    console.log("🔐 Seeding Permissions...");
    const permissionData = [
        // Master Data (WBS, Fleet, Items)
        { code: "masterdata.read", module: "masterdata", description: "View WBS, Items, and Fleet Assets" },
        { code: "masterdata.write", module: "masterdata", description: "Manage WBS and Catalog Items" },
        
        // Projects
        { code: "project.read", module: "projects", description: "View Project Details" },
        { code: "project.write", module: "projects", description: "Manage Projects" },
        { code: "project.access.manage", module: "projects", description: "Project assignment controls" },

        // Personnel
        { code: "personnel.read", module: "personnel", description: "View Employee Records" },
        { code: "personnel.write", module: "personnel", description: "Manage Personnel Data" },

        // Vendors
        { code: "vendor.read", module: "vendors", description: "View Vendor Directory" },
        { code: "vendor.write", module: "vendors", description: "Manage Vendor Lifecycle" },

        // Governance & Auth
        { code: "user.register", module: "auth", description: "Register new users" },
        { code: "user.lock", module: "auth", description: "Lock/Unlock users" },
        { code: "role.create", module: "roles", description: "Create system roles" },
        { code: "role.update", module: "roles", description: "Modify role permissions" },
        { code: "role.delete", module: "roles", description: "Archive roles" },
        
        // Approvals
        { code: "approval.request", module: "approvals", description: "Create approval requests" },
        { code: "approval.approve", module: "approvals", description: "Approve assigned steps" },
        { code: "approval.read", module: "approvals", description: "View Inbox and History" },

        // Dashboards
        { code: "dashboard.superadmin", module: "dashboards", description: "View Group-wide Metrics" },
        { code: "dashboard.company", module: "dashboards", description: "View Company Analytics" },
        { code: "dashboard.project", module: "dashboards", description: "View Site-level Progress" },
        { code: "dashboard.department", module: "dashboards", description: "View Dept Head Dashboard" },
        { code: "dashboard.compliance", module: "dashboards", description: "View Legal Compliance Board" },

        // Audit & System
        { code: "audit.read", module: "audit", description: "View global audit logs" },
        { code: "settings.read", module: "settings", description: "View system preferences" },
        { code: "settings.manage", module: "settings", description: "Manage enterprise configuration" }
    ];

    const permissions = {};
    for (const p of permissionData) {
        permissions[p.code] = await prisma.permission.upsert({
            where: { code: p.code },
            update: p,
            create: p
        });
    }

    // 5. SEED ROLES
    console.log("🏛️ Seeding Roles...");
    const roles = {};
    const roleDefinitions = [
        { code: "super_admin", name: "Super Admin", is_system_role: true },
        { code: "erp_admin", name: "ERP Admin", is_system_role: true },
        { code: "project_manager", name: "Project Manager", is_system_role: false },
        { code: "site_engineer", name: "Site Engineer", is_system_role: false }
    ];
    for (const r of roleDefinitions) {
        roles[r.code] = await prisma.role.upsert({
            where: { code: r.code },
            update: r,
            create: r
        });
    }

    // 6. MAP PERMISSIONS (RBAC Matrix Harmonized)
    console.log("🔗 Mapping RBAC Matrix...");
    const associations = [];

    // Helper to safely add associations
    const link = (roleCode, permCode) => {
        if (roles[roleCode] && permissions[permCode]) {
            associations.push({ role_id: roles[roleCode].id, permission_id: permissions[permCode].id });
        } else {
            console.warn(`⚠️ Skipped mapping: ${roleCode} -> ${permCode} (Not found)`);
        }
    };

    // Super Admin gets everything
    for (const p in permissions) {
        link("super_admin", p);
    }

    // ERP Admin gets almost everything
    for (const p in permissions) {
        if (!p.includes("delete") && !p.includes("superadmin")) {
            link("erp_admin", p);
        }
    }

    // Project Manager scope
    ["masterdata.read", "project.read", "personnel.read", "approval.read", "approval.approve", "dashboard.project"]
        .forEach(p => link("project_manager", p));

    // Site Engineer scope
    ["masterdata.read", "approval.request", "approval.read", "dashboard.project"]
        .forEach(p => link("site_engineer", p));

    try {
        await prisma.rolePermission.createMany({ 
            data: associations,
            skipDuplicates: true 
        });
        console.log(`✅ mapped ${associations.length} permission links.`);
    } catch (assocErr) {
        console.warn("⚠️ Some RBAC mappings failed:", assocErr.message);
    }

    // 7. SEED PROJECTS
    console.log("🏗️ Seeding Projects...");
    const projects = {};
    const projectsData = [
        { code: "PRJ-NEOM-9", name: "NEOM Square Infrastructure", company_id: mainCo.id, status: "active" },
        { code: "PRJ-METRO-7", name: "Riyadh Metro Extension", company_id: mainCo.id, status: "active" }
    ];
    for (const p of projectsData) {
        projects[p.code] = await prisma.project.create({ data: p });
    }

    const neom = projects["PRJ-NEOM-9"];
    const metro = projects["PRJ-METRO-7"];

    // 8. SEED WBS & COST CODES
    console.log("📐 Seeding WBS Hierarchy...");
    const wbs1 = await prisma.wBS.create({ data: { project_id: neom.id, name: "Site Mobilization" } });
    const wbs2 = await prisma.wBS.create({ data: { project_id: neom.id, name: "Earthworks", parent_id: wbs1.id } });
    
    await prisma.costCode.createMany({ 
        data: [
            { wbs_id: wbs1.id, category: "material" },
            { wbs_id: wbs1.id, category: "labor" },
            { wbs_id: wbs2.id, category: "equipment" }
        ]
    });

    // 9. SEED ITEMS (CATALOG)
    console.log("📦 Seeding Item Catalog...");
    const itemsData = [
        { name: "Portland Cement (50kg Bag)", category: "cement", unit: "BAG", company_id: mainCo.id },
        { name: "Deformed Steel Bar (12mm)", category: "steel", unit: "TON", company_id: mainCo.id },
        { name: "Diesel Fuel (Ultra Low Sulfur)", category: "fuel", unit: "LITER", company_id: mainCo.id }
    ];
    for (const i of itemsData) {
        await prisma.item.create({ data: i });
    }

    // 10. SEED TEST USERS
    console.log("👥 Seeding Test Users...");
    const hashedPass = await bcrypt.hash("Password123!", BCRYPT_ROUNDS);
    const usersCreated = {};
    const usersToCreate = [
        { email: "superadmin@erp.com", name: "Super Admin", role: "super_admin", dept: "DEPT-ADM", comp: "ANT-CONS" },
        { email: "admin@erp.com", name: "Antigravity Admin", role: "erp_admin", dept: "DEPT-ADM", comp: "ANT-CONS" },
        { email: "admin2@megabuild.com", name: "MegaBuild Admin", role: "erp_admin", dept: "DEPT-ADM", comp: "MB-CORP" },
        { email: "pm@erp.com", name: "Ahmed Manager", role: "project_manager", dept: "DEPT-CIV", comp: "ANT-CONS" },
        { email: "engineer@erp.com", name: "Sara Engineer", role: "site_engineer", dept: "DEPT-CIV", comp: "ANT-CONS" }
    ];
    for (const u of usersToCreate) {
        usersCreated[u.email] = await prisma.user.create({
            data: {
                email: u.email,
                name: u.name,
                password_hash: hashedPass,
                role_id: roles[u.role].id,
                department_id: depts[u.dept] ? depts[u.dept].id : null,
                company_id: companies[u.comp].id
            }
        });
    }

    // 11. SEED EMPLOYEES
    console.log("👷 Seeding Employees...");
    await prisma.employee.createMany({
        data: [
            { name: "John Doe", designation: "Foreman", project_id: neom.id, iqama_no: "2100000001", saudization_status: "expat" },
            { name: "Khalid Abdullah", designation: "Electrician", project_id: neom.id, iqama_no: "1100000002", saudization_status: "citizen" }
        ]
    });

    // 12. SEED FLEET (VEHICLES/EQUIPMENT)
    console.log("🚛 Seeding Fleet...");
    await prisma.vehicle.create({
        data: { vehicle_no: "TRUCK-001", plate_no: "ABC-123", running_site: neom.id, department: "DEPT-PRO" }
    });
    await prisma.equipment.create({
        data: { equipment_no: "EXCAV-002", name: "Cat Excavator 320", running_site: neom.id, status: "active" }
    });

    // 13. SEED DOCUMENTS (COMPLIANCE)
    console.log("📜 Seeding Compliance Data...");
    await prisma.companyDocument.create({
        data: { 
            company_id: mainCo.id, 
            type: "Commercial Registration (CR)", 
            document_number: "1010000001",
            issue_date: new Date("2024-01-01"),
            expiry_date: new Date("2025-01-01") 
        }
    });

    // 14. SEED PENDING APPROVAL
    console.log("📥 Seeding Pending Approval...");
    await prisma.approvalRequest.create({
        data: {
            doc_type: "PR",
            doc_id: "PR-2024-001",
            project_id: neom.id,
            requester_id: usersCreated["engineer@erp.com"].id,
            company_id: mainCo.id,
            current_status: "pending",
            total_steps: 1,
            current_step: 1,
            amount: 50000,
            approval_steps: {
                create: [{ step_order: 1, role_id: roles["project_manager"].id, status: "pending" }]
            }
        }
    });

    console.log("✅ Final Enterprise Harmonized Seeding Complete!");
    console.log("------------------------------------------");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
