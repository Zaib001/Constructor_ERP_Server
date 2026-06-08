require('dotenv').config();
const prisma = require('../src/db');
const { getUserProjects } = require('../src/modules/projectAccess/projectAccess.service');

async function main() {
    try {
        console.log("Checking Project Access for Site Engineer...");
        const engineer = await prisma.user.findFirst({
            where: { email: 'engineer@constructionerp.com' }
        });
        if (!engineer) {
            console.log("Engineer user not found!");
        } else {
            const mockEngineer = {
                id: engineer.id,
                roleCode: 'site_engineer',
                companyId: engineer.company_id
            };
            const resultEng = await getUserProjects(engineer.id, mockEngineer);
            console.log(`Engineer: ${engineer.name}`);
            console.log(`Total projects returned: ${resultEng.projects.length}`);
            resultEng.projects.forEach(p => {
                console.log(` - Project: ${p.name} [Access: ${p.access_type}]`);
            });
        }

        console.log("\nChecking Project Access for Admin...");
        const admin = await prisma.user.findFirst({
            where: { email: 'admin@erp.com' }
        });
        if (!admin) {
            console.log("Admin user not found!");
        } else {
            const mockAdmin = {
                id: admin.id,
                roleCode: 'erp_admin',
                companyId: admin.company_id
            };
            const resultAdmin = await getUserProjects(admin.id, mockAdmin);
            console.log(`Admin: ${admin.name}`);
            console.log(`Total projects returned: ${resultAdmin.projects.length}`);
            resultAdmin.projects.forEach(p => {
                console.log(` - Project: ${p.name} [Access: ${p.access_type}]`);
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
