/**
 * seed.js  —  Hoopoees Keyzite ERP
 * Creates a default admin role + dummy admin user.
 *
 * Run:  node prisma/seed.js
 */
require("dotenv").config();

const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BCRYPT_ROUNDS = 12;

async function main() {
    console.log("🌱  Seeding Hoopoees Keyzite ERP...\n");

    // 1. Upsert enterprise roles
    const rolesData = [
        { name: "Administrator", code: "admin", description: "Full-access system administrator", is_system_role: true },
        { name: "Vice President", code: "VP", description: "Executive oversight and high-level approvals" },
        { name: "Project Director", code: "DIRECTOR", description: "Strategic project management and steering" },
        { name: "Project Manager", code: "MANAGER", description: "Daily site operations and team management" },
        { name: "Project Lead", code: "LEAD", description: "Tactical Execution and technical oversight" },
        { name: "System Auditor", code: "AUDITOR", description: "Compliance monitoring and log review" },
    ];

    const roles = {};
    for (const r of rolesData) {
        roles[r.code] = await prisma.role.upsert({
            where: { code: r.code },
            update: { name: r.name, description: r.description },
            create: { ...r, is_active: true },
        });
        console.log(`✔  Role: ${r.name}`);
    }

    // 2. Upsert dummy users for each role
    const usersData = [
        { name: "System Admin", email: "admin@hoopoees.com", code: "EMP-001", role: "admin", dept: "Management" },
        { name: "Executive VP", email: "vp@hoopoees.com", code: "EMP-002", role: "VP", dept: "Executive" },
        { name: "Project Dir", email: "director@hoopoees.com", code: "EMP-003", role: "DIRECTOR", dept: "Operation" },
        { name: "Site Manager", email: "manager@hoopoees.com", code: "EMP-004", role: "MANAGER", dept: "Site" },
        { name: "Team Lead", email: "lead@hoopoees.com", code: "EMP-005", role: "LEAD", dept: "Engineering" },
        { name: "Audit Officer", email: "auditor@hoopoees.com", code: "EMP-006", role: "AUDITOR", dept: "Compliance" },
    ];

    const defaultPassword = "Admin@1234";
    const hash = await bcrypt.hash(defaultPassword, BCRYPT_ROUNDS);

    console.log("\n👤  Seeding Users...");
    for (const u of usersData) {
        await prisma.user.upsert({
            where: { email: u.email },
            update: { password_hash: hash, role_id: roles[u.role].id },
            create: {
                name: u.name,
                email: u.email,
                employee_code: u.code,
                password_hash: hash,
                department: u.dept,
                role_id: roles[u.role].id,
                is_active: true,
            },
        });
        console.log(`✔  User: ${u.name} (${u.role})`);
    }

    console.log("\n✅  Seeding successful!");
    console.log(`    Default Password for all: ${defaultPassword}`);
    console.log("\n🎉  Done!\n");
}

main()
    .catch((err) => {
        console.error("\n❌  Seed error:", err.message ?? err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
