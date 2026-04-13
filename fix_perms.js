require('dotenv').config();
const prisma = require('./src/db');

async function fixPermissions() {
    try {
        const rolesToUpdate = ['site_engineer', 'site_coordinator', 'project_manager'];
        
        // 1. Get the permission ID for 'employee.read'
        const perm = await prisma.permission.findUnique({ where: { code: 'employee.read' } });
        if (!perm) throw new Error("Permission 'employee.read' not found");

        const roles = await prisma.role.findMany({ where: { code: { in: rolesToUpdate } } });
        
        let added = 0;
        for (const role of roles) {
            // Check if already mapped
            const existing = await prisma.rolePermission.findFirst({
                where: { role_id: role.id, permission_id: perm.id }
            });
            
            if (!existing) {
                await prisma.rolePermission.create({
                    data: { role_id: role.id, permission_id: perm.id }
                });
                added++;
                console.log(`Added employee.read to ${role.code}`);
            } else {
                console.log(`${role.code} already has employee.read`);
            }
        }
        
        console.log(`Fixed ${added} roles. Done.`);
    } catch(e) {
        console.error("Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}
fixPermissions();
