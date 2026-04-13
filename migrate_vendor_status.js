require("dotenv").config();
const prisma = require("./src/db");

async function main() {
    console.log("🚀 Starting Vendor Status Migration...");

    try {
        const result = await prisma.vendor.updateMany({
            where: { status: "approved" },
            data: { status: "active" }
        });

        console.log(`✅ Migration complete. Updated ${result.count} vendors from 'approved' to 'active'.`);
    } catch (err) {
        console.error("❌ Migration failed:", err);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
