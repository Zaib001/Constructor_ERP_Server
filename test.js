const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const projs = await prisma.project.findMany();
    console.log('Projects:', projs.map(p => ({id: p.id, company_id: p.company_id, name: p.name})));
    const users = await prisma.user.findMany({ select: { id:true, email:true, company_id:true, roles: { select: { code: true } } } });
    console.log('Users:', users);
}

check()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
