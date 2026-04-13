"use strict";

/**
 * seed_qc_inspector.js
 * ──────────────────────────────────────────────────────────────
 * Adds a QC Inspector role, permissions, and user account
 * WITHOUT wiping existing data.
 *
 * Run: node prisma/seed_qc_inspector.js
 *
 * New User:
 *   qc@erp.com  /  Password123!  →  qc_inspector role
 *   Full access to: Quality Hub, ITP Manager, Inspections, NCR Tracker
 *   Read access to: WBS, Projects, Execution module
 * ──────────────────────────────────────────────────────────────
 */

require("dotenv").config();
const { Pool }       = require("pg");
const { PrismaPg }   = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const bcrypt         = require("bcrypt");

const pool    = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

async function main() {
    console.log("🚀  Seeding QC Inspector role & user (non-destructive)...\n");

    // ── 1. Upsert QC-specific permissions ─────────────────────────────────────
    const qcPermissions = [
        { code: "quality.read",   module: "quality", description: "View ITP plans, Inspections, and NCR records" },
        { code: "quality.manage", module: "quality", description: "Create and update ITP, Inspections, NCRs" },
        { code: "quality.close",  module: "quality", description: "Close / resolve NCRs and inspection results" },
    ];

    const permMap = {};
    for (const p of qcPermissions) {
        permMap[p.code] = await prisma.permission.upsert({
            where:  { code: p.code },
            update: { module: p.module, description: p.description },
            create: p,
        });
        console.log(`  ✅  Permission: ${p.code}`);
    }

    // ── Also make sure the shared permissions needed already exist ─────────────
    const sharedCodes = ["execution.read", "project.read", "wbs.read", "approval.read", "approval.request"];
    for (const code of sharedCodes) {
        const perm = await prisma.permission.findUnique({ where: { code } });
        if (perm) permMap[code] = perm;
        else console.warn(`  ⚠️   Shared permission '${code}' not found — skipping.`);
    }

    // ── 2. Upsert QC Inspector role ────────────────────────────────────────────
    const role = await prisma.role.upsert({
        where:  { code: "qc_inspector" },
        update: { name: "QC Inspector" },
        create: { code: "qc_inspector", name: "QC Inspector", is_system_role: false },
    });
    console.log(`\n  ✅  Role: ${role.code} — ${role.id}`);

    // ── 3. Assign permissions to role ─────────────────────────────────────────
    const allCodes = [
        "quality.read", "quality.manage", "quality.close",
        "execution.read", "project.read", "wbs.read",
        "approval.read", "approval.request",
    ];

    for (const code of allCodes) {
        const perm = permMap[code];
        if (!perm) { console.warn(`  ⚠️   Skipping missing perm: ${code}`); continue; }
        await prisma.rolePermission.upsert({
            where:  { role_id_permission_id: { role_id: role.id, permission_id: perm.id } },
            update: {},
            create: { role_id: role.id, permission_id: perm.id },
        }).catch(async () => {
            // If upsert fails (no unique constraint), try findFirst + create
            const existing = await prisma.rolePermission.findFirst({
                where: { role_id: role.id, permission_id: perm.id }
            });
            if (!existing) {
                await prisma.rolePermission.create({ data: { role_id: role.id, permission_id: perm.id } });
            }
        });
        console.log(`  🔗  Linked: ${code} → qc_inspector`);
    }

    // ── 4. Find the main company ───────────────────────────────────────────────
    const mainCo = await prisma.company.findFirst({ where: { code: "ANT-CONS" } });
    if (!mainCo) throw new Error("Main company 'ANT-CONS' not found. Run the main seed first.");

    // ── 5. Find the NEOM project ───────────────────────────────────────────────
    const neomProject = await prisma.project.findFirst({ where: { code: "PRJ-NEOM-9" } });

    // ── 6. Upsert QC Inspector user ────────────────────────────────────────────
    const hashedPass = await bcrypt.hash("Password123!", 10);
    const dept = await prisma.department.findFirst({ where: { code: "DEPT-CIV" } });

    const existingUser = await prisma.user.findUnique({ where: { email: "qc@erp.com" } });
    let qcUser;
    if (existingUser) {
        qcUser = await prisma.user.update({
            where: { email: "qc@erp.com" },
            data: { role_id: role.id, name: "Ziad QC Inspector" },
        });
        console.log("\n  ✅  Updated existing qc@erp.com user with new role.");
    } else {
        qcUser = await prisma.user.create({
            data: {
                email:         "qc@erp.com",
                name:          "Ziad QC Inspector",
                password_hash: hashedPass,
                role_id:       role.id,
                company_id:    mainCo.id,
                department_id: dept?.id ?? null,
            },
        });
        console.log("\n  ✅  Created new user: qc@erp.com");
    }

    // ── 7. Assign to project ───────────────────────────────────────────────────
    if (neomProject) {
        const existingAccess = await prisma.userProject.findFirst({
            where: { user_id: qcUser.id, project_id: neomProject.id }
        });
        if (!existingAccess) {
            await prisma.userProject.create({
                data: { user_id: qcUser.id, project_id: neomProject.id, access_type: "qc_inspector" }
            });
            console.log(`  ✅  Project access granted: ${neomProject.name}`);
        } else {
            console.log(`  ℹ️   Project access already exists for: ${neomProject.name}`);
        }
    }

    // ── 8. Ensure WBS route accepts quality.read too ──────────────────────────
    // (This is handled in the backend code via the updated requirePermission)
    // No DB changes needed — the route fix is already deployed.

    // ── Summary ────────────────────────────────────────────────────────────────
    console.log("\n" + "═".repeat(60));
    console.log("🎉  QC Inspector Seed Complete!");
    console.log("═".repeat(60));
    console.log("\n🔑  New Credentials:");
    console.log("   Email:     qc@erp.com");
    console.log("   Password:  Password123!");
    console.log("   Role:      QC Inspector (qc_inspector)");
    console.log("   Project:   NEOM Square Infrastructure");
    console.log("\n🔒  QC Inspector Permissions:");
    console.log("   quality.read    → View all Quality Hub data");
    console.log("   quality.manage  → Create ITPs, IRs, NCRs");
    console.log("   quality.close   → Close/resolve NCRs");
    console.log("   execution.read  → View DPR & Execution dashboards");
    console.log("   wbs.read        → WBS dropdown in ITP Manager");
    console.log("   project.read    → Select projects");
    console.log("═".repeat(60));
}

main()
    .catch(e => { console.error("❌  Seed failed:", e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
