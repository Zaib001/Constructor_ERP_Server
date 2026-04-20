
require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    try {
        console.log("Checking columns for 'auth.employees' table...");
        const columns = await prisma.$queryRaw`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'auth' AND table_name = 'employees';
        `;
        console.table(columns);
    } catch (err) {
        console.error("Error querying columns:", err);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
