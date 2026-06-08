require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    try {
        const stockCount = await prisma.inventoryStock.count();
        console.log(`Total stock rows in database: ${stockCount}`);

        const stocks = await prisma.inventoryStock.findMany({
            take: 10,
            include: {
                store: { select: { name: true, company_id: true } },
                item: { select: { name: true } }
            }
        });
        console.log("\nSample Stock Entries:");
        stocks.forEach(s => {
            console.log(`- Item: ${s.item.name}, Qty: ${s.quantity}, Store: ${s.store.name}, Company ID: ${s.company_id || s.store.company_id}`);
        });

        const stores = await prisma.store.findMany({
            include: { company: { select: { name: true } } }
        });
        console.log("\nAll Stores:");
        stores.forEach(s => {
            console.log(`- Store: ${s.name}, Company: ${s.company?.name} (${s.company_id})`);
        });

        // Let's check PM user's company and standard stock
        const pm = await prisma.user.findFirst({
            where: { email: 'pm@erp.com' }
        });
        if (pm) {
            console.log(`\nPM User Company ID: ${pm.company_id}`);
            const pmStocks = await prisma.inventoryStock.findMany({
                where: { company_id: pm.company_id },
                include: { store: true, item: true }
            });
            console.log(`PM's Company Stock Rows: ${pmStocks.length}`);
            pmStocks.forEach(s => {
                console.log(` - Item: ${s.item.name}, Qty: ${s.quantity}, Store: ${s.store.name}`);
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
