require('dotenv').config();
const prisma = require('../src/db');

async function main() {
  console.log('🏢 Listing Companies:');
  const companies = await prisma.company.findMany();
  console.dir(companies, { depth: null });

  console.log('\n🌿 Listing Projects:');
  const projects = await prisma.project.findMany();
  console.dir(projects, { depth: null });

  console.log('\n📁 Listing Departments:');
  const departments = await prisma.department.findMany();
  console.dir(departments, { depth: null });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
