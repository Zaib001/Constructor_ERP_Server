require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    try {
        const companyId = "c757c5dc-3cdf-4f70-9ed3-082f1268f10e";
        const projects = await prisma.project.findMany({
            where: { company_id: companyId }
        });
        console.log(`Projects for company ${companyId}:`);
        projects.forEach(p => {
            console.log(` - ID: ${p.id}, Code: ${p.code}, Name: ${p.name}, Status: ${p.status}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
