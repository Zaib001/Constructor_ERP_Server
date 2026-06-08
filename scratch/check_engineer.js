require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    try {
        const email = "engineer@constructionerp.com";
        const user = await prisma.user.findFirst({
            where: { email },
            include: { roles: true }
        });
        if (!user) {
            console.log(`User ${email} not found!`);
        } else {
            console.log(`User: ${user.name}`);
            console.log(`Role: ${user.roles?.name} (${user.roles?.code})`);
            console.log(`Company ID: ${user.company_id}`);
        }
        
        const email2 = "engineer@erp.com";
        const user2 = await prisma.user.findFirst({
            where: { email: email2 },
            include: { roles: true }
        });
        if (!user2) {
            console.log(`User ${email2} not found!`);
        } else {
            console.log(`User2: ${user2.name}`);
            console.log(`Role2: ${user2.roles?.name} (${user2.roles?.code})`);
            console.log(`Company ID2: ${user2.company_id}`);
        }
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
