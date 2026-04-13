require('dotenv').config();
const prisma = require('../src/db');

async function backfill() {
  console.log('--- Backfilling Project-Department Links ---');

  try {
    const projs = await prisma.project.findMany();
    const depts = await prisma.department.findMany();

    console.log(`Found ${projs.length} projects and ${depts.length} departments.`);

    const neom = projs.find(p => p.name.includes('NEOM'));
    const jeddah = projs.find(p => p.name.includes('Jeddah'));
    const metro = projs.find(p => p.name.includes('Metro'));

    const civil = depts.find(d => d.name === 'Civil Engineering');
    const mep = depts.find(d => d.name === 'MEP & Electrical');

    if (neom && civil) {
      await prisma.project.update({ where: { id: neom.id }, data: { department_id: civil.id } });
      console.log(`Linked ${neom.name} to ${civil.name}`);
    }

    if (jeddah && mep) {
      await prisma.project.update({ where: { id: jeddah.id }, data: { department_id: mep.id } });
      console.log(`Linked ${jeddah.name} to ${mep.name}`);
    }

    if (metro && civil) {
      await prisma.project.update({ where: { id: metro.id }, data: { department_id: civil.id } });
      console.log(`Linked ${metro.name} to ${civil.name}`);
    }

    console.log('--- Backfill Complete ---');
  } catch (err) {
    console.error('Backfill Error:', err);
  }
}

backfill()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
