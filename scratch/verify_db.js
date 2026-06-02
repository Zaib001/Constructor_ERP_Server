require('dotenv').config();
const prisma = require('../src/db');

async function main() {
  console.log('📊 Querying employee distribution in DB...');
  const allEmployees = await prisma.employee.findMany({
    select: {
      id: true,
      employee_code: true,
      name: true,
      company_id: true,
    }
  });

  console.log(`Total employees in DB: ${allEmployees.length}`);

  const nullCompanyEmployees = allEmployees.filter(e => e.company_id === null);
  console.log(`Employees with company_id = null: ${nullCompanyEmployees.length}`);
  
  const dummyEmployees = allEmployees.filter(e => 
    e.employee_code && (e.employee_code.startsWith('TEST-NC-') || e.employee_code.startsWith('SERV-NC-'))
  );
  console.log(`Dummy test employees: ${dummyEmployees.length}`);

  if (nullCompanyEmployees.length > 0) {
    console.log('\nFirst 5 company-less employees:');
    nullCompanyEmployees.slice(0, 5).forEach(e => {
      console.log(`- [${e.employee_code}] ${e.name}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
