require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

async function main() {
    const COMPANY_ID = "aea170b3-85c2-4884-9edb-21555b46b0a2"; // cubix
    const PROJECT_ID = "7d8a49a8-0fe4-425b-baa7-c3a07e0617ac"; // Spine Tunnel

    const users = await p.user.findMany({
        where: { company_id: COMPANY_ID },
        include: { roles: true }
    });
    console.log("Cubix users:");
    users.forEach(u => console.log(`  ${u.email} | ${u.roles?.code} | ${u.id}`));

    const wbs = await p.wBS.findMany({ where: { project_id: PROJECT_ID }, take: 3 });
    console.log("\nSpine Tunnel WBS:", wbs.map(w => `${w.id} | ${w.name}`));

    const cc = await p.costCode.findMany({ where: { wbs: { project_id: PROJECT_ID } }, take: 3 });
    console.log("\nCostCodes:", cc.map(c => `${c.id} | ${c.code}`));

    const items = await p.item.findMany({ where: { company_id: COMPANY_ID }, take: 5 });
    console.log("\nCubix items:", items.map(i => `${i.id} | ${i.name}`));

    // Also check Antigravity for PM/SK
    console.log("\n--- Antigravity users ---");
    const agUsers = await p.user.findMany({
        where: { company_id: "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6" },
        include: { roles: true }
    });
    agUsers.forEach(u => console.log(`  ${u.email} | ${u.roles?.code}`));
}

main().finally(async () => { await p.$disconnect(); await pool.end(); });
