require('dotenv').config();
const prisma = require('../src/db');

async function main() {
  console.log('👷 Testing creation of an employee without a company ID (null company_id)...');

  // We generate a unique employee code and iqama number to avoid duplicate key constraint errors
  const uniqueId = Date.now().toString().slice(-6);
  const employeeCode = `TEST-NC-${uniqueId}`;
  const iqamaNo = `999${uniqueId}`;
  const passportNo = `PP-${uniqueId}`;

  try {
    const employee = await prisma.employee.create({
      data: {
        employee_code: employeeCode,
        name: 'Test Employee No Company',
        blood_group: 'O+',
        department: 'HR & Administration',
        designation: 'Staff Member',
        nationality: 'Saudi Arabia',
        iqama_no: iqamaNo,
        iqama_expiry: new Date('2028-12-31'),
        passport_no: passportNo,
        passport_expiry: new Date('2028-12-31'),
        joining_date: new Date(),
        basic_salary: 5000,
        other_allowance: 1000,
        saudization_status: 'citizen',
        is_active: true,
        // Explicitly set company_id to null
        company_id: null,
        // We can also set project_id to null
        project_id: null,
        attachments: {
          note: 'Seeded via HR test without company_id'
        }
      }
    });

    console.log('\n✅ Employee created successfully WITHOUT company_id!');
    console.log('═══════════════════════════════════════════════════');
    console.log(`ID:            ${employee.id}`);
    console.log(`Name:          ${employee.name}`);
    console.log(`Code:          ${employee.employee_code}`);
    console.log(`Company ID:    ${employee.company_id} (Expected: null)`);
    console.log(`Project ID:    ${employee.project_id} (Expected: null)`);
    console.log(`Iqama No:      ${employee.iqama_no}`);
    console.log(`Joined At:     ${employee.joining_date}`);
    console.log('═══════════════════════════════════════════════════\n');

    // Confirm by fetching it from the database
    const fetched = await prisma.employee.findUnique({
      where: { id: employee.id }
    });
    if (fetched && fetched.company_id === null) {
      console.log('🎉 Verification success: Confirmed in database that company_id is indeed NULL!');
    } else {
      console.log('⚠️ Verification warning: Fetching returned unexpected data.');
    }

  } catch (error) {
    console.error('❌ Failed to create employee without company_id:', error);
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
