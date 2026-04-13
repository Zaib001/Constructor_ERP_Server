require('dotenv').config();
const prisma = require('../src/db');

async function checkMatrices() {
  try {
    const matrices = await prisma.approvalMatrix.findMany({
      include: {
        roles: true,
        projects: true,
        departments: true
      }
    });
    console.log(JSON.stringify(matrices, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMatrices();
