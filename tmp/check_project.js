require('dotenv').config();
const prisma = require('../src/db');

async function checkProject() {
  try {
    const project = await prisma.project.findUnique({
      where: { id: '13fc32dc-e314-4391-a2be-767fb74b5a19' }
    });
    console.log(JSON.stringify(project, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProject();
