require('dotenv').config();
const prisma = require('./src/db');
async function main() {
    console.log("Roles:");
    const roles = await prisma.role.findMany({ 
        select: { id: true, name: true, code: true } 
    });
    console.log(JSON.stringify(roles, null, 2));
    
    console.log("\nCompanies:");
    const companies = await prisma.company.findMany({
        select: { id: true, name: true, code: true }
    });
    console.log(JSON.stringify(companies, null, 2));

    console.log("\nUsers with Role Codes:");
    const users = await prisma.user.findMany({ 
        include: { 
            roles: { select: { code: true } },
            company: { select: { name: true } }
        } 
    });
    console.log(JSON.stringify(users.map(u => ({ 
        email: u.email, 
        role: u.roles?.code, 
        company: u.company?.name 
    })), null, 2));
}
main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
