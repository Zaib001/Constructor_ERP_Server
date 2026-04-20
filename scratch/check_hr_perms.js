
require("dotenv").config();
const prisma = require("../src/db");

async function main() {
    try {
        const role = await prisma.role.findFirst({
            where: { code: "hr_manager" }
        });
        
        if (!role) {
            console.log("Role 'hr_manager' not found.");
            return;
        }
        
        const perms = await prisma.rolePermission.findMany({
            where: { role_id: role.id },
            include: { permissions: true }
        });
        
        console.log(`Permissions for role 'hr_manager':`);
        perms.forEach(p => console.log(` - ${p.permissions.code}`));
        
        const hasCompanyRead = perms.some(p => p.permissions.code === "company.read");
        console.log(`\nHas 'company.read': ${hasCompanyRead}`);
        
    } catch (err) {
        console.error("Error in diagnostic script:", err);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
