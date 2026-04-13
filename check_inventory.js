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

async function checkStock() {
    const companyId = 'b5a9e2db-661c-481f-a83e-f173abc42e2e';
    console.log(`Checking stock for company: ${companyId}`);

    const stocks = await prisma.inventoryStock.findMany({
        where: { company_id: companyId },
        include: {
            item: { select: { name: true } },
            store: { select: { name: true } }
        }
    });

    console.log('--- Inventory Stocks ---');
    if (stocks.length === 0) {
        console.log('No stock records found.');
    } else {
        stocks.forEach(s => {
            console.log(`Store: ${s.store.name} | Item: ${s.item.name} | Qty: ${s.quantity}`);
        });
    }

    const grns = await prisma.goodsReceiptNote.findMany({
        where: { company_id: companyId },
        orderBy: { received_at: 'desc' },
        take: 5,
        include: {
            items: true
        }
    });

    console.log('\n--- Recent GRNs ---');
    grns.forEach(g => {
        console.log(`GRN: ${g.grn_no} | Date: ${g.received_at} | Items: ${g.items.length}`);
        g.items.forEach(gi => {
            console.log(`  - ItemID: ${gi.item_id} | Qty: ${gi.qty_received}`);
        });
    });

    await prisma.$disconnect();
}

checkStock().catch(err => {
    console.error(err);
    process.exit(1);
});
