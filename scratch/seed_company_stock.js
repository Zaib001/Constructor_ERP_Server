require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    try {
        const pmCompanyId = "92f0aa78-8dd8-41c3-969a-2e0089d0aeb6";

        // 1. Ensure Store exists
        let store = await prisma.store.findFirst({
            where: { company_id: pmCompanyId, name: "Main Warehouse" }
        });

        if (!store) {
            store = await prisma.store.create({
                data: {
                    company_id: pmCompanyId,
                    name: "Main Warehouse",
                    location: "Site Office — Ground Floor",
                    is_active: true
                }
            });
            console.log(`Created Main Warehouse store for company ${pmCompanyId}: ${store.id}`);
        } else {
            console.log(`Main Warehouse store already exists for company ${pmCompanyId}: ${store.id}`);
        }

        // 2. Find all items for company
        const items = await prisma.item.findMany({
            where: { company_id: pmCompanyId }
        });
        console.log(`Found ${items.length} items for company ${pmCompanyId}.`);

        // 3. Upsert stock for each item
        let count = 0;
        for (const item of items) {
            await prisma.inventoryStock.upsert({
                where: { store_id_item_id: { store_id: store.id, item_id: item.id } },
                update: {}, // do not overwrite if exists
                create: {
                    company_id: pmCompanyId,
                    store_id: store.id,
                    item_id: item.id,
                    quantity: 1000 // Seed with 1000 units
                }
            });
            count++;
        }
        console.log(`Seeded ${count} stock entries with 1000 units each.`);
    } catch (err) {
        console.error("Error seeding stock:", err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
