
require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    try {
        const roles = await prisma.role.findMany();
        console.log("Current Roles in DB:");
        console.log(JSON.stringify(roles, null, 2));
        
        const users = await prisma.user.findMany({
            include: { roles: true }
        });
        console.log("\nUsers and their Roles:");
        users.forEach(u => {
            console.log(`User: ${u.email}, Role: ${u.roles?.code}`);
        });
    } catch (err) {
        console.error("Error in diagnostic script:", err);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
