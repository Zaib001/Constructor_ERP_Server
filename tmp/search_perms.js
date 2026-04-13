const prisma = require('../src/db');

async function check() {
    try {
        const perms = await prisma.permission.findMany({
            where: {
                OR: [
                    { code: { contains: 'vendor' } },
                    { code: { contains: 'po' } }
                ]
            }
        });
        console.log("\n--- Vendor & PO Permissions ---");
        console.log(JSON.stringify(perms, null, 2));

        const roles = await prisma.role.findMany({
            where: {
                code: { in: ['super_admin', 'dept_head', 'employee'] }
            },
            include: {
                role_permissions: {
                    include: {
                        permissions: true
                    }
                }
            }
        });

        console.log("\n--- Role Permissions Mapping ---");
        roles.forEach(role => {
            console.log(`\nRole: ${role.code}`);
            role.role_permissions.forEach(rp => {
                console.log(` - ${rp.permissions?.code}`);
            });
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
