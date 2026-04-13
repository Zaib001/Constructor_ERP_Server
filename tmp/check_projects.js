require('dotenv').config();
const prisma = require('../src/db');

async function check() {
    const projects = await prisma.project.findMany({ where: { status: 'active' } });
    console.log('Active projects:', projects.length);
    projects.forEach(p => console.log(' ', p.id, p.name, p.code, p.status, 'Company:', p.company_id));
    
    const all = await prisma.project.findMany();
    console.log('\nAll projects:', all.length);
    all.forEach(p => console.log(' ', p.id, p.name, p.code, p.status, 'Company:', p.company_id));
    
    await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
