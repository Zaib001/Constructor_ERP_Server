require('dotenv').config();
const prisma = require('../src/db');

async function main() {
  const email = 'engineer@erp.com';
  const user = await prisma.user.findUnique({
    where: { email }
  });
  
  if (user) {
    console.log(`User verification SUCCESS!`);
    console.log(`ID: ${user.id}`);
    console.log(`Name: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Company ID: ${user.company_id}`);
    console.log(`Role ID: ${user.role_id}`);
  } else {
    console.log(`User with email ${email} not found!`);
  }
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
