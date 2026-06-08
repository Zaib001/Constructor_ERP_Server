require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

async function main() {
    // Get engineer full details
    const eng = await p.user.findFirst({
        where: { email: "engineer@erp.com" },
        include: { roles: true, company: true }
    });
    console.log("Engineer:", eng?.email, "| role:", eng?.roles?.code, "| company_id:", eng?.company_id, "| company:", eng?.company?.name);

    const pm = await p.user.findFirst({
        where: { email: "pm@erp.com" },
        include: { roles: true, company: true }
    });
    console.log("PM:", pm?.email, "| role:", pm?.roles?.code, "| company_id:", pm?.company_id, "| company:", pm?.company?.name);

    const sk = await p.user.findFirst({
        where: { email: "storekeeper@erp.com" },
        include: { roles: true, company: true }
    });
    console.log("SK:", sk?.email, "| role:", sk?.roles?.code, "| company_id:", sk?.company_id);

    // Get projects for engineer
    const eng_projects = await p.userProject.findMany({
        where: { user_id: eng.id, revoked_at: null },
        include: { projects: true }
    });
    console.log("\nEngineer projects:", eng_projects.map(p => `${p.project_id} | ${p.projects?.name} | company: ${p.projects?.company_id}`));

    // WBS for the NEOM project
    const wbs = await p.wBS.findMany({ where: { project_id: { in: eng_projects.map(ep => ep.project_id) } }, take: 5 });
    console.log("\nWBS for engineer projects:", wbs.map(w => `${w.id} | ${w.name} | project: ${w.project_id}`));

    // CostCode
    if (wbs.length > 0) {
        const cc = await p.costCode.findFirst({ where: { wbs_id: wbs[0].id } });
        console.log("\nFirst CostCode:", cc?.id, cc?.code, "wbs:", cc?.wbs_id);
    }

    // Items for the company
    const items = await p.item.findMany({ where: { company_id: eng.company_id }, take: 5 });
    console.log("\nItems (company):", items.map(i => `${i.id} | ${i.name}`));

    // ApprovalMatrix for MR
    const mrMatrix = await p.approvalMatrix.findMany({ where: { doc_type: "MR" } });
    console.log("\nMR Approval Matrix:", mrMatrix);
}

main().finally(async () => { await p.$disconnect(); await pool.end(); });
