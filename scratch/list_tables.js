require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    // List tables
    const tables = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'auth' 
        ORDER BY table_name
    `;
    console.log("Tables in auth schema:");
    tables.forEach(t => console.log(" -", t.table_name));

    // Try to find COA data
    try {
        const rows = await prisma.$queryRaw`
            SELECT column_name FROM information_schema.columns 
            WHERE table_schema = 'auth' 
            AND table_name LIKE '%account%'
            ORDER BY table_name, ordinal_position
        `;
        console.log("\nColumns in account-related tables:");
        rows.forEach(r => console.log(" -", r.column_name));
    } catch(e) {
        console.error("Column query error:", e.message);
    }
}

main().finally(() => prisma.$disconnect());
