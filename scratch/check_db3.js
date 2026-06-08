require("dotenv").config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

async function main() {
    // Check cost codes for the NEOM project
    const wbsIds = ["34b7a62d-212b-4f3a-afb9-2ca673870fe3"]; // Site Mobilization for NEOM
    
    const allCostCodes = await p.costCode.findMany({
        where: { wbs_id: { in: wbsIds } },
        take: 5
    });
    console.log("CostCodes for NEOM WBS:", allCostCodes.map(c => `${c.id} | ${c.code}`));

    // Broader search - all cost codes in NEOM project
    const wbsAll = await p.wBS.findMany({ where: { project_id: "db0e9eec-32da-4091-b607-38dd327725f2" } });
    const allWbsIds = wbsAll.map(w => w.id);
    const allCC = await p.costCode.findMany({ where: { wbs_id: { in: allWbsIds } }, take: 5 });
    console.log("\nAll CostCodes for NEOM:", allCC.map(c => `${c.id} | ${c.code} | wbs: ${c.wbs_id}`));

    // Check the engineer's company's items
    const engCompItems = await p.item.findMany({ where: { company_id: "c757c5dc-3cdf-4f70-9ed3-082f1268f10e" }, take: 3 });
    console.log("\nEngineer's company items:", engCompItems.map(i => `${i.id} | ${i.name}`));

    // Check Antigravity company items
    const agItems = await p.item.findMany({ where: { company_id: "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6" }, take: 5 });
    console.log("\nAntigravity company items:", agItems.map(i => `${i.id} | ${i.name}`));
    
    // Check pm@erp.com's user-project assignments
    const pmProjects = await p.userProject.findMany({
        where: { user_id: "c2d8051d-639d-4a67-8fd3-1511d8f7c605", revoked_at: null },
        include: { projects: true }
    });
    console.log("\nPM projects:", pmProjects.map(p => `${p.project_id} | ${p.projects?.name}`));
}

main().finally(async () => { await p.$disconnect(); await pool.end(); });
