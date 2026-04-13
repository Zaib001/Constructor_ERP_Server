"use strict";

/**
 * fix_qc_permissions.js
 * ───────────────────────────────────────────────────────
 * Removes execution.read from qc_inspector so the role
 * only sees Quality Control screens, not the full
 * Execution / DPR / HSE modules.
 *
 * Run: node prisma/fix_qc_permissions.js
 * ───────────────────────────────────────────────────────
 */

require("dotenv").config();
const { Pool }         = require("pg");
const { PrismaPg }     = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const pool    = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

async function main() {
    console.log("🔧  Tightening QC Inspector permissions...\n");

    const role = await prisma.role.findUnique({ where: { code: "qc_inspector" } });
    if (!role) throw new Error("qc_inspector role not found");

    // Remove execution.read — QC routes now accept quality.read directly
    const execPerm = await prisma.permission.findUnique({ where: { code: "execution.read" } });
    if (execPerm) {
        const deleted = await prisma.rolePermission.deleteMany({
            where: { role_id: role.id, permission_id: execPerm.id }
        });
        console.log(`  ✅  Removed execution.read from qc_inspector (${deleted.count} record)`);
    }

    // Ensure wbs.read is explicitly assigned (for the WBS dropdown)
    const wbsPerm = await prisma.permission.findUnique({ where: { code: "wbs.read" } });
    if (wbsPerm) {
        const existing = await prisma.rolePermission.findFirst({
            where: { role_id: role.id, permission_id: wbsPerm.id }
        });
        if (!existing) {
            await prisma.rolePermission.create({
                data: { role_id: role.id, permission_id: wbsPerm.id }
            });
            console.log("  ✅  Ensured wbs.read is assigned to qc_inspector");
        } else {
            console.log("  ℹ️   wbs.read already assigned — OK");
        }
    }

    // Print final permission list for qc_inspector
    const finalPerms = await prisma.rolePermission.findMany({
        where: { role_id: role.id },
        include: { permission: true }
    });

    console.log("\n📋  Final qc_inspector permissions:");
    finalPerms.forEach(rp => console.log(`     ✅  ${rp.permission.code}`));

    console.log("\n🎯  QC Inspector will now ONLY see:");
    console.log("     • Dashboard (redirects to Quality Hub)");
    console.log("     • My Approvals");
    console.log("     • Projects (read)");
    console.log("     • Project WBS (read — for ITP dropdown)");
    console.log("     • Project Progress (read)");
    console.log("     • Quality Hub");
    console.log("     • ITP Manager");
    console.log("     • Inspection Log");
    console.log("     • NCR Tracking");
    console.log("\n     ❌  Execution / DPR / HSE / Procurement / Finance — all hidden");
}

main()
    .catch(e => { console.error("❌  Failed:", e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
