require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

async function main() {
    // Check all site_engineers and their companies/projects
    const engineers = await p.user.findMany({
        where: { roles: { code: "site_engineer" } },
        include: { roles: true, company: true, user_projects: { include: { projects: true } } }
    });
    
    for (const eng of engineers) {
        console.log(`\nEngineer: ${eng.email} | company: ${eng.company?.name} (${eng.company_id})`);
        eng.user_projects.forEach(up => {
            console.log(`  -> Project: ${up.projects?.name} (${up.project_id}) company: ${up.projects?.company_id} revoked: ${up.revoked_at}`);
        });
    }

    // Check storekeeper's company
    const sk = await p.user.findFirst({
        where: { email: "storekeeper@erp.com" },
        include: { roles: true, company: true, user_projects: { include: { projects: true } } }
    });
    console.log(`\nStorekeeper: ${sk.email} | company: ${sk.company?.name} (${sk.company_id})`);
    sk.user_projects.forEach(up => {
        console.log(`  -> Project: ${up.projects?.name} revoked: ${up.revoked_at}`);
    });
}

main().finally(async () => { await p.$disconnect(); await pool.end(); });
