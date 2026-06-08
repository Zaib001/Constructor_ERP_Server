require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    try {
        const users = await prisma.user.findMany({
            include: { roles: true }
        });
        console.log("All Users and Roles:");
        users.forEach(u => {
            console.log(`- Email: ${u.email}, Name: ${u.name}, Role Code: ${u.roles?.code}, Role Name: ${u.roles?.name}`);
        });

        const roles = await prisma.role.findMany();
        console.log("\nAll Roles in Database:");
        roles.forEach(r => {
            console.log(`- Code: ${r.code}, Name: ${r.name}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
