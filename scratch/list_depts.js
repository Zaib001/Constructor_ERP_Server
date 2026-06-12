require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    const company = await prisma.company.findUnique({
        where: { code: "ANT-CONS" }
    });
    if (!company) {
        console.error("Company ANT-CONS not found!");
        return;
    }
    const depts = await prisma.department.findMany({
        where: { company_id: company.id }
    });
    console.log(`Departments for ${company.name}:`);
    depts.forEach(d => console.log(`- ID: ${d.id}, Code: ${d.code}, Name: ${d.name}`));
}
main().finally(() => prisma.$disconnect());
