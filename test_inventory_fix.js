require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testInventory() {
    const user = {
        id: "799a2a4e-6c5b-4829-9b9c-faec1e517e99", // Site Engineer
        companyId: "b7325d70-99c3-4440-aa3f-aa777c6753ee",
        roleCode: "site_engineer"
    };

    try {
        // 1. Find an item to add stock for
        const item = await prisma.item.findFirst({
            where: { company_id: user.companyId }
        });

        if (!item) {
            console.log("No items found for company. Please seed items first.");
            return;
        }

        console.log(`Adding stock for item: ${item.name}`);

        // 2. Add Stock
        const newStock = await prisma.inventoryStock.create({
            data: {
                item_id: item.id,
                company_id: user.companyId,
                department: "Test Site A",
                quantity: 150.50,
                description: "Test stock add"
            }
        });
        console.log("Created Stock Record:", newStock);

        // 3. Retrieve Stock
        const stocks = await prisma.inventoryStock.findMany({
            where: { company_id: user.companyId, deleted_at: null },
            include: { item: true }
        });
        console.log(`Found ${stocks.length} stock records.`);
        stocks.forEach(s => {
            console.log(` - ${s.item.name}: ${s.quantity} (${s.department})`);
        });

    } catch (err) {
        console.error("Test Failed!");
        console.error("Message:", err.message);
        console.error("Stack:", err.stack);
        if (err.code) console.error("Code:", err.code);
    } finally {
        await prisma.$disconnect();
    }
}

testInventory();
