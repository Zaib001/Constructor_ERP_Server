require('dotenv').config();
const prisma = require('./src/db');

async function debug() {
  const projectId = '2bba9245-0574-4ee3-920a-08978509894f';
  try {
    console.log('Checking project:', projectId);
    const p = await prisma.project.findUnique({
      where: { id: projectId }
    });
    console.log('Project result:', JSON.stringify(p, null, 2));

    const company = await prisma.company.findFirst();
    console.log('Sample Company ID:', company?.id);

    const user = await prisma.user.findFirst();
    console.log('Sample User ID:', user?.id);
    console.log('Sample User company_id:', user?.company_id);

  } catch (err) {
    console.error('DEBUG ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
}

debug();
