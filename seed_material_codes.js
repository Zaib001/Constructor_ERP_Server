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

async function seedMissingMaterialCodes() {
    const companyId = 'b5a9e2db-661c-481f-a83e-f173abc42e2e';
    
    const wbsNodes = await prisma.wBS.findMany({
        where: { project: { company_id: companyId }, deleted_at: null },
        include: { cost_codes: true }
    });

    console.log(`Checking ${wbsNodes.length} WBS nodes for missing material codes...`);

    for (const node of wbsNodes) {
        const hasMaterial = node.cost_codes.some(cc => cc.category === 'material');
        if (!hasMaterial) {
            console.log(`Adding material cost code to: ${node.name}`);
            await prisma.costCode.create({
                data: {
                    wbs_id: node.id,
                    category: 'material',
                    budget_amount: 50000 // default dummy budget for testing
                }
            });
        }
    }

    console.log('Seeding complete.');
    await prisma.$disconnect();
}

seedMissingMaterialCodes().catch(err => {
    console.error(err);
    process.exit(1);
});
