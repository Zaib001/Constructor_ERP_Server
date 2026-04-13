require("dotenv").config();
const prisma = require("./src/db");

async function cleanup() {
    try {
        await prisma.$executeRawUnsafe(`DELETE FROM auth.inventory_stocks`);
        console.log("✅ Cleared stale inventory_stocks rows");
    } catch (err) {
        console.error("❌ Cleanup failed:", err.message);
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
