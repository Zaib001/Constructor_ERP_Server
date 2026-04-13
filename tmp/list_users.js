const prisma = require('../src/db');

async function listUsers() {
    try {
        const users = await prisma.user.findMany({
            include: {
                roles: true,
                departments: true
            },
            take: 20
        });
        
        console.log("\n--- Available Users for Testing ---");
        users.forEach(u => {
            console.log(`- ${u.name.padEnd(20)} | Role: ${(u.roles?.code || "N/A").padEnd(12)} | Dept: ${(u.departments?.name || "Global").padEnd(15)} | Email: ${u.email}`);
        });
        console.log("-----------------------------------\n");
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

listUsers();
