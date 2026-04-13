require('dotenv').config();
const prisma = require('./src/db');
async function main() {
    console.log("Projects:");
    const projects = await prisma.project.findMany();
    console.log(projects.map(p => ({ id: p.id, company_id: p.company_id, name: p.name })));
    console.log("\nUsers:");
    const users = await prisma.user.findMany({ select: { id: true, email: true, company_id: true } });
    console.log(users);
}
main().finally(() => prisma.$disconnect());
