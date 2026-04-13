require('dotenv').config();
const prisma = require('../src/db');

async function checkCompanies() {
  try {
    const companies = await prisma.company.findMany();
    console.log(JSON.stringify(companies, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCompanies();
