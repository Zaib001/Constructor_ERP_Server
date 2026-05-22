require("dotenv").config();
const prisma = require("./src/db");

async function check() {
    try {
        console.log("--- ALL STORES ---");
        const stores = await prisma.store.findMany();
        stores.forEach(s => console.log(`Store: ${s.name} [${s.id}] Co: ${s.company_id}`));

        console.log("\n--- INVENTORY STOCKS ---");
        const stocks = await prisma.inventoryStock.findMany({ take: 10 });
        stocks.forEach(st => console.log(`Stock: Store: ${st.store_id} Item: ${st.item_id} Qty: ${st.quantity}`));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
