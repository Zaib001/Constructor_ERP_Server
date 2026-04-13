require('dotenv').config();
const projectsService = require("./src/modules/projects/projects.service");

async function run() {
    const user = {
        id: "some-uuid",
        companyId: "e9fdfcf6-15ec-44ec-9e20-302de292da27", // From the schema... wait, I'll fetch a company
        roleCode: "erp_admin",
        isSuperAdmin: false
    };

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const company = await prisma.company.findFirst();
    if (!company) return console.log("No company");
    user.companyId = company.id;

    try {
        console.log("Fetching projects...");
        const res = await projectsService.getAll(user, 1, 10);
        console.log("Result:", JSON.stringify(res, null, 2));
    } catch (e) {
        console.error("Error from getAll:", e);
    }
    await prisma.$disconnect();
}

run();
