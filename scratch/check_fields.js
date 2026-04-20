
require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    const model = "Employee";
    console.log(`Checking fields for ${model}...`);
    // Prisma doesn't have a direct "get fields" but we can try to fetch one record and see the keys
    const record = await prisma.employee.findFirst();
    if (record) {
        console.log("Record keys:", Object.keys(record));
    } else {
        console.log("No records found to check keys.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
