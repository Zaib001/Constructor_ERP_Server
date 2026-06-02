require('dotenv').config();
const prisma = require('../src/db');
const employeesService = require('../src/modules/employees/employees.service');

async function main() {
  console.log('👷 Testing creation of an employee without a company ID via employeesService...');

  // Fetch an existing user from the database to serve as our mock HR creator
  const dbUser = await prisma.user.findFirst({
    include: { roles: true }
  });

  if (!dbUser) {
    console.error('❌ No user found in the database. Please seed first.');
    return;
  }

  console.log(`Mocking HR Admin user: ${dbUser.name} (${dbUser.email})`);

  // Construct our mock HR user object
  const mockHRUser = {
    id: dbUser.id,
    email: dbUser.email,
    companyId: dbUser.company_id,
    roleCode: 'hr_admin' // Force the hr_admin role code to test the new targetCompanyId logic
  };

  const uniqueId = Date.now().toString().slice(-6);
  const employeeCode = `SERV-NC-${uniqueId}`;
  const iqamaNo = `888${uniqueId}`;
  const passportNo = `PP-SERV-${uniqueId}`;

  // Employee data payload with explicit NULL company_id
  const payload = {
    employee_code: employeeCode,
    name: 'Service Employee No Company',
    blood_group: 'AB+',
    department: 'Human Resources',
    designation: 'Recruit',
    nationality: 'Indian',
    iqama_no: iqamaNo,
    iqama_expiry: new Date('2028-12-31'),
    passport_no: passportNo,
    passport_expiry: new Date('2028-12-31'),
    joining_date: new Date(),
    basic_salary: 4000,
    housing_allowance: 500,
    transportation_allowance: 500,
    other_allowance: 200,
    is_active: true,
    // Explicitly request NO company_id
    company_id: null,
    project_id: null,
    attachments: {
      source: 'Service creation test'
    }
  };

  try {
    // Call the updated createEmployee service method
    const employee = await employeesService.createEmployee(payload, mockHRUser);

    console.log('\n✅ Service call SUCCESS! Employee created without company_id.');
    console.log('═══════════════════════════════════════════════════');
    console.log(`ID:            ${employee.id}`);
    console.log(`Name:          ${employee.name}`);
    console.log(`Code:          ${employee.employee_code}`);
    console.log(`Company ID:    ${employee.company_id} (Expected: null)`);
    console.log(`Iqama No:      ${employee.iqama_no}`);
    console.log(`Basic Salary:  ${employee.basic_salary}`);
    console.log('═══════════════════════════════════════════════════\n');

    // Confirm that the employee is listable by this HR user even with a null company_id
    console.log('🔍 Testing if this employee is visible in list query...');
    const listResult = await employeesService.getAllEmployees(mockHRUser, null, null, 1, 50, 'all');
    const foundInList = listResult.data.find(emp => emp.id === employee.id);
    
    if (foundInList) {
      console.log('🎉 List verification success: Confirmed that HR can see the employee in listing!');
    } else {
      console.log('⚠️ List verification warning: Employee is not visible in listing.');
    }

    // Confirm getEmployeeById works
    console.log('🔍 Testing if getEmployeeById works...');
    const singleFetched = await employeesService.getEmployeeById(employee.id, mockHRUser);
    if (singleFetched && singleFetched.company_id === null) {
      console.log('🎉 Fetch verification success: Confirmed getEmployeeById successfully retrieved the employee!');
    } else {
      console.log('⚠️ Fetch verification warning: Could not retrieve the employee by ID.');
    }

  } catch (error) {
    console.error('❌ Failed to create employee via service:', error);
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
