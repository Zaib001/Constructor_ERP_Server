require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    try {
        // 1. Find the target roles
        const legacyRole = await prisma.role.findUnique({ where: { code: 'ENGINEER' } });
        const standardRole = await prisma.role.findUnique({ where: { code: 'site_engineer' } });

        if (!standardRole) {
            console.error("Standard site_engineer role not found in database! Run seed script first.");
            return;
        }

        if (legacyRole) {
            console.log(`Found legacy ENGINEER role (ID: ${legacyRole.id}).`);
            console.log(`Found standard site_engineer role (ID: ${standardRole.id}).`);

            // Find users with legacy role
            const usersToUpdate = await prisma.user.findMany({
                where: { role_id: legacyRole.id }
            });

            console.log(`Found ${usersToUpdate.length} users with legacy ENGINEER role.`);

            for (const user of usersToUpdate) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { role_id: standardRole.id }
                });
                console.log(`Updated user ${user.email} (${user.name}) to site_engineer role.`);
            }

            // Delete legacy role permissions association first
            await prisma.rolePermission.deleteMany({
                where: { role_id: legacyRole.id }
            });

            // Delete legacy role
            await prisma.role.delete({
                where: { id: legacyRole.id }
            });
            console.log("Deleted legacy ENGINEER role from database.");
        } else {
            console.log("No legacy ENGINEER role found. Database is clean.");
        }
        
    } catch (err) {
        console.error("Error fixing roles:", err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
