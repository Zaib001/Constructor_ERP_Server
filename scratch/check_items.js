require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    try {
        const itemCompanies = await prisma.item.groupBy({
            by: ['company_id'],
            _count: { id: true }
        });
        console.log("Items per Company:");
        itemCompanies.forEach(ic => {
            console.log(`- Company ID: ${ic.company_id}, Item Count: ${ic._count.id}`);
        });

        // Check if items exist for the PM's company
        const pmCompanyId = "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6";
        const items = await prisma.item.findMany({
            where: { company_id: pmCompanyId },
            take: 5
        });
        console.log(`\nSample items for PM's company (${pmCompanyId}):`);
        items.forEach(i => {
            console.log(`- Name: ${i.name}, Code: ${i.code}, Standard Price: ${i.standard_price}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
