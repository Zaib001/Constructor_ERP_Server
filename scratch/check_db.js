require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

async function main() {
    const users = await p.user.findMany({ include: { roles: true }, take: 20 });
    users.forEach(u => console.log(u.email, "|", u.roles?.code, "|", u.id));
    
    console.log("\n--- Projects ---");
    const projects = await p.userProject.findMany({ include: { projects: true }, take: 10 });
    projects.forEach(up => console.log(up.user_id, "->", up.project_id, up.projects?.name));
}

main().finally(async () => { await p.$disconnect(); await pool.end(); });
