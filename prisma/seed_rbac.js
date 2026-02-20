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
    console.log("🚀 Starting RBAC Reconfiguration...");

    // 1. CLEAR PREVIOUS DATA
    console.log("🧹 Clearing existing data...");
    await prisma.auditLog.deleteMany();
    await prisma.systemLog.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.approvalStep.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.approvalMatrix.deleteMany();
    await prisma.approvalDelegation.deleteMany();
    await prisma.userSession.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.userProject.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.role.deleteMany();

    // 2. SEED PERMISSIONS
    console.log("🔐 Seeding Permissions...");
    const permissionData = [
        // Auth & Users
        { code: "user.register", module: "auth", description: "Register new users" },
        { code: "user.lock", module: "auth", description: "Lock/Unlock users" },

        // Roles & Governance
        { code: "role.manage", module: "roles", description: "Full role management (CRUD + Assign)" },
        { code: "permission.manage", module: "roles", description: "Create system permissions" },

        // Project Context
        { code: "project.access.manage", module: "project", description: "Assign/Revoke project access" },
        { code: "project.view_users", module: "project", description: "View users in project" },

        // Approval Engine (Action Codes used by Sidebar and logic)
        { code: "pr.submit", module: "approvals", description: "Submit Purchase Requisitions" },
        { code: "po.submit", module: "approvals", description: "Submit Purchase Orders" },
        { code: "invoice.submit", module: "approvals", description: "Submit Invoices" },
        { code: "pr.approve", module: "approvals", description: "Approve PRs" },
        { code: "po.approve", module: "approvals", description: "Approve POs" },
        { code: "approval.request", module: "approvals", description: "Create new approval requests" },
        { code: "approval.approve", module: "approvals", description: "Approve assigned steps" },
        { code: "approval.reject", module: "approvals", description: "Reject any assigned request" },
        { code: "approval.read", module: "approvals", description: "View Inbox and History" },
        { code: "approval.override", module: "approvals", description: "Bypass matrix rules" },

        // Session Management
        { code: "session.force_logout", module: "sessions", description: "Terminate other users' sessions" },

        // Audit & Visibility
        { code: "audit.read", module: "audit", description: "View audit logs" },
        { code: "system.read", module: "audit", description: "View system health/logs" },

        // Delegations
        { code: "delegation.manage", module: "delegation", description: "Create and disable delegations" },
        { code: "delegation.read", module: "delegation", description: "View system delegations" },
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
        { code: "project_manager", name: "Project Manager", description: "Project workflow controller", is_system_role: false },
        { code: "site_engineer", name: "Site Engineer", description: "Field requester", is_system_role: false },
        { code: "procurement_officer", name: "Procurement Officer", description: "Supply chain controller", is_system_role: false },
        { code: "accountant", name: "Accountant", description: "Financial auditor", is_system_role: false },
        { code: "vendor", name: "Vendor", description: "External supply partner", is_system_role: false },
    ];

    const roles = {};
    for (const r of roleDefinitions) {
        roles[r.code] = await prisma.role.create({ data: r });
    }

    // 4. MAP PERMISSIONS (RBAC Matrix)
    console.log("🔗 Mapping RBAC Matrix...");

    const map = (roleCode, permissionCodes) => {
        return permissionCodes.map(pCode => ({
            role_id: roles[roleCode].id,
            permission_id: permissions[pCode].id
        }));
    };

    const associations = [
        ...map("super_admin", Object.keys(permissions)), // Everything
        ...map("erp_admin", [
            "user.register", "user.lock", "role.manage", "project.access.manage",
            "project.view_users", "approval.read", "approval.approve", "approval.reject", "session.force_logout", "audit.read", "system.read",
            "delegation.manage", "delegation.read"
        ]),
        ...map("project_manager", [
            "pr.submit", "pr.approve", "po.approve", "approval.request", "approval.approve", "approval.reject", "approval.read",
            "project.access.manage", "project.view_users"
        ]),
        ...map("site_engineer", ["pr.submit", "approval.request", "approval.read"]),
        ...map("procurement_officer", ["pr.submit", "po.submit", "po.approve", "approval.request", "approval.approve", "approval.read"]),
        ...map("accountant", ["invoice.submit", "po.approve", "approval.request", "approval.approve", "approval.read"]),
        ...map("vendor", ["invoice.submit", "approval.request"]),
    ];

    await prisma.rolePermission.createMany({ data: associations });

    // 5. SEED PROJECTS
    console.log("📂 Seeding Projects...");
    const projectsData = [
        { code: "PRJ-NEOM-01", name: "NEOM Infrastructure P1", description: "Urban planning and road networks", status: "active" },
        { code: "PRJ-RYD-MET", name: "Riyadh Metro Ext", description: "Line 7 extension and station works", status: "active" },
        { code: "PRJ-RED-SEA", name: "Red Sea Luxury Resort", description: "Coastal development and villas", status: "active" }
    ];

    const projects = {};
    for (const p of projectsData) {
        projects[p.code] = await prisma.project.create({ data: p });
    }

    // 6. SEED TEST USERS
    console.log("👥 Seeding Test Users...");
    const hashedDefault = await bcrypt.hash("Password123!", BCRYPT_ROUNDS);

    const usersToCreate = [
        { email: "superadmin@erp.com", name: "Super Admin User", role: "super_admin" },
        { email: "admin@erp.com", name: "ERP Admin User", role: "erp_admin" },
        { email: "pm@erp.com", name: "Project Manager One", role: "project_manager" },
        { email: "engineer@erp.com", name: "Site Engineer One", role: "site_engineer" },
        { email: "procurement@erp.com", name: "Procurement Lead", role: "procurement_officer" },
        { email: "accountant@erp.com", name: "Chief Accountant", role: "accountant" },
        { email: "vendor@partner.com", name: "Global Vendor", role: "vendor" },
    ];

    const seededUsers = {};
    for (const u of usersToCreate) {
        seededUsers[u.email] = await prisma.user.create({
            data: {
                email: u.email,
                name: u.name,
                password_hash: hashedDefault,
                role_id: roles[u.role].id,
                is_active: true,
            }
        });
    }

    // 7. SEED PROJECT ASSIGNMENTS
    console.log("🔗 Seeding Project Assignments...");
    const adminUser = seededUsers["superadmin@erp.com"];
    const pmUser = seededUsers["pm@erp.com"];
    const engUser = seededUsers["engineer@erp.com"];

    const assignments = [
        { user_id: pmUser.id, project_id: projects["PRJ-NEOM-01"].id, access_type: "full", assigned_by: adminUser.id },
        { user_id: pmUser.id, project_id: projects["PRJ-RYD-MET"].id, access_type: "full", assigned_by: adminUser.id },
        { user_id: engUser.id, project_id: projects["PRJ-RYD-MET"].id, access_type: "contributor", assigned_by: adminUser.id },
        { user_id: engUser.id, project_id: projects["PRJ-NEOM-01"].id, access_type: "contributor", assigned_by: adminUser.id }
    ];

    await prisma.userProject.createMany({ data: assignments });

    // 8. SEED APPROVAL MATRICES
    console.log("📐 Seeding Approval Matrices...");
    const matrixData = [
        { doc_type: "PR", min_amount: 0, max_amount: 1000000, role_id: roles["project_manager"].id, step_order: 1 },
        { doc_type: "PR", min_amount: 1000001, max_amount: 999999999, role_id: roles["erp_admin"].id, step_order: 2 },
        // PO
        { doc_type: "PO", min_amount: 0, max_amount: 500000, role_id: roles["project_manager"].id, step_order: 1 },
        { doc_type: "PO", min_amount: 500001, max_amount: 999999999, role_id: roles["erp_admin"].id, step_order: 2 },
        // GRN
        { doc_type: "GRN", min_amount: 0, max_amount: 999999999, role_id: roles["site_engineer"].id, step_order: 1 },
        // INV
        { doc_type: "INV", min_amount: 0, max_amount: 999999999, role_id: roles["accountant"].id, step_order: 1 },
    ];
    await prisma.approvalMatrix.createMany({ data: matrixData });

    // 9. SEED PENDING APPROVAL
    console.log("📥 Seeding Pending Approval...");
    const prRequest = await prisma.approvalRequest.create({
        data: {
            doc_type: "PR",
            doc_id: "77777777-7777-7777-7777-777777777777",
            project_id: projects["PRJ-NEOM-01"].id,
            requested_by: engUser.id,
            current_status: "in_progress",
            total_steps: 1,
            current_step: 1,
            approval_steps: {
                create: [
                    {
                        step_order: 1,
                        role_id: roles["project_manager"].id,
                        status: "pending",
                    }
                ]
            }
        }
    });

    console.log("✅ RBAC & Enterprise Seeding Complete!");
    console.log("------------------------------------------");
    console.log("Credentials for all: Email as above / Password: Password123!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
