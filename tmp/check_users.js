require('dotenv').config();
const prisma = require('../src/db');

async function check() {
    const users = await prisma.user.findMany({
        include: { roles: true }
    });
    console.log('Users:', users.length);
    users.forEach(u => {
        console.log(`- ${u.name} (${u.email})`);
        console.log(`  ID: ${u.id}`);
        console.log(`  Role: ${u.roles?.code}`);
        console.log(`  Company ID: ${u.company_id}`);
        console.log('---');
    });
    
    await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
