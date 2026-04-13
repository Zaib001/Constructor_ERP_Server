require('dotenv').config();
const prisma = require('./src/db');

async function check() {
    try {
        const role = await prisma.role.findUnique({
            where: { code: 'site_engineer' },
            include: { role_permissions: { include: { permissions: true } } }
        });
        
        if (!role) {
            console.log("Role site_engineer not found");
            return;
        }
        
        console.log(`Role: ${role.name} (${role.code})`);
        console.log("Permissions:");
        role.role_permissions.forEach(p => {
            console.log(`- ${p.permissions.code}: ${p.permissions.description}`);
        });
    } catch (err) {
        console.error("Error checking permissions:", err);
    } finally {
        await prisma.$disconnect();
    }
}

check();
