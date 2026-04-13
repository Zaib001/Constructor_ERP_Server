require('dotenv').config();
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ 
    connectionString,
    max: 8,
    ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkWBSCosts() {
    const companyId = 'b5a9e2db-661c-481f-a83e-f173abc42e2e';
    
    const wbsNodes = await prisma.wBS.findMany({
        where: { project: { company_id: companyId }, deleted_at: null },
        include: { cost_codes: true },
        take: 10
    });

    if (wbsNodes.length === 0) {
        console.log('No WBS nodes found for this company.');
    } else {
        console.log(`--- WBS Nodes & Cost Codes ---`);
        wbsNodes.forEach(node => {
            console.log(`WBS: ${node.name} (${node.wbs_code})`);
            if (node.cost_codes.length === 0) {
                console.log(`  - No cost codes found.`);
            } else {
                node.cost_codes.forEach(cc => {
                    console.log(`  - Cost Code Category: ${cc.category} | ID: ${cc.id}`);
                });
            }
        });
    }

    await prisma.$disconnect();
}

checkWBSCosts().catch(err => {
    console.error(err);
    process.exit(1);
});
