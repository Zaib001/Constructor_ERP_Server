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

async function checkPOs() {
    const companyId = 'b5a9e2db-661c-481f-a83e-f173abc42e2e';
    
    const pos = await prisma.purchaseOrder.findMany({
        where: { company_id: companyId },
        orderBy: { created_at: 'desc' },
        take: 5
    });

    if (pos.length === 0) {
        console.log('No Purchase Orders found.');
    } else {
        console.log(`--- Recent POs for Company ---`);
        pos.forEach(po => {
            console.log(`- PO: ${po.po_number} | Status: ${po.status} | Site: ${po.project_id || 'GENERAL'}`);
        });
    }

    const dts = await prisma.deliveryTracking.findMany({
        take: 10,
        orderBy: { created_at: 'desc' }
    });

    console.log(`\n--- Recent Delivery Tracking Logs ---`);
    if (dts.length === 0) {
        console.log('No tracking logs found.');
    } else {
        dts.forEach(dt => {
            console.log(`- Tracking for PO ID: ${dt.po_id} | Status: ${dt.status} | Site: ${dt.project_id || 'GENERAL'}`);
        });
    }

    await prisma.$disconnect();
}

checkPOs().catch(err => {
    console.error(err);
    process.exit(1);
});
