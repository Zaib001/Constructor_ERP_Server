"use strict";

require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    console.log("Testing connection and querying ApprovalMatrix...");
    try {
        const count = await prisma.approvalMatrix.count();
        console.log(`Current ApprovalMatrix count: ${count}`);
        
        const first = await prisma.approvalMatrix.findFirst();
        console.log("First record:", first);

        const roles = await prisma.role.findMany();
        console.log("Available Roles:", roles.map(r => r.code));
    } catch (e) {
        console.error("Prisma Error Details:");
        console.error(e);
        if (e.code) console.error("Error Code:", e.code);
        if (e.meta) console.error("Error Meta:", e.meta);
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
