"use strict";

require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    const roles = await prisma.role.findMany({
        select: { code: true, name: true }
    });
    console.log("Current Roles in Database:");
    console.table(roles);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
