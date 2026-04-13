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

async function checkAllPOs() {
    const companyId = 'b5a9e2db-661c-481f-a83e-f173abc42e2e';
    
    const pos = await prisma.purchaseOrder.findMany({
        where: { company_id: companyId, deleted_at: null },
        orderBy: { created_at: 'desc' },
        take: 10
    });

    if (pos.length === 0) {
        console.log('No Purchase Orders found.');
    } else {
        console.log(`--- All Recent POs ---`);
        pos.forEach(po => {
            console.log(`PO: ${po.po_number} | Status: ${po.status} | Delivery: ${po.delivery_status} | Created: ${po.created_at}`);
        });
    }

    await prisma.$disconnect();
}

checkAllPOs().catch(err => {
    console.error(err);
    process.exit(1);
});
