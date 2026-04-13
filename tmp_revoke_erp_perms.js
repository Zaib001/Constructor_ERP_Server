const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function removeGlobalPerms() {
    console.log("Removing global permissions from ERP Admin...");

    const erpAdmin = await prisma.role.findUnique({
        where: { code: 'erp_admin' }
    });

    if (!erpAdmin) {
        console.log("ERP Admin role not found!");
        return;
    }

    // Explicit list of permission codes to REVOKE from ERP Admin
    const permsToRevoke = [
        "company.read", "company.create", "company.update", "company.manage",
        "department.read", "department.manage",
        "delegation.read", "delegation.manage",
        "audit.read",
        "role.manage",
        "system.read",
        "settings.read", "settings.manage"
    ];

    // Find the IDs of these permissions
    const perms = await prisma.permission.findMany({
        where: { code: { in: permsToRevoke } }
    });

    const permIds = perms.map(p => p.id);

    if (permIds.length > 0) {
        const result = await prisma.rolePermission.deleteMany({
            where: {
                role_id: erpAdmin.id,
                permission_id: { in: permIds }
            }
        });
        console.log(`Successfully removed ${result.count} explicit global permissions from ERP Admin.`);
    } else {
        console.log("No matching permissions found in the database to revoke.");
    }
}

removeGlobalPerms()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
