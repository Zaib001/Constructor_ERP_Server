require('dotenv').config();
const prisma = require('../src/db');
const path = require('path');

async function main() {
  console.log('🧹 Step 1: Removing dummy/test employees...');

  // Helper: delete all child records for a set of employee IDs
  async function cascadeDeleteEmployees(ids) {
    if (!ids.length) return;
    // Delete in FK dependency order — deepest children first
    await prisma.employeeBankAccount.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.salaryRevision.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.payrollItem.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.payslip.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.attendance.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.attendanceCorrection.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.overtimeRequest.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.leaveBalance.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.leaveRequest.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.timesheet.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  }

  // Remove the dummy test employees created by the test scripts
  const dummyEmps = await prisma.employee.findMany({
    where: {
      OR: [
        { employee_code: { startsWith: 'TEST-NC-' } },
        { employee_code: { startsWith: 'SERV-NC-' } },
      ]
    },
    select: { id: true }
  });
  const dummyIds = dummyEmps.map(e => e.id);
  await cascadeDeleteEmployees(dummyIds);
  console.log(`   ✅ Removed ${dummyIds.length} dummy test employee(s).`);

  // Also remove any prior seedings from parsed_employees.json to ensure idempotency
  const realCodes = parsedEmployees.map(e => e.employee_code);
  const priorEmps = await prisma.employee.findMany({
    where: { employee_code: { in: realCodes } },
    select: { id: true }
  });
  const priorIds = priorEmps.map(e => e.id);
  if (priorIds.length > 0) {
    await cascadeDeleteEmployees(priorIds);
    console.log(`   ✅ Removed ${priorIds.length} previously seeded real employee(s).`);
  }

  console.log(`\n👷 Step 2: Seeding ${parsedEmployees.length} real employees from employees.tsv (company_id: null)...`);
  let seededCount = 0;
  let bankAccountCount = 0;
  const errors = [];

  for (const empData of parsedEmployees) {
    try {
      const employee = await prisma.employee.create({
        data: {
          employee_code: empData.employee_code,
          name: empData.name,
          blood_group: empData.blood_group || null,
          department: empData.department || null,
          designation: empData.designation || null,
          nationality: empData.nationality || null,
          iqama_no: empData.iqama_no || null,
          iqama_expiry: empData.iqama_expiry ? new Date(empData.iqama_expiry) : null,
          passport_no: empData.passport_no || null,
          passport_expiry: empData.passport_expiry ? new Date(empData.passport_expiry) : null,
          insurance_no: empData.insurance_no || null,
          insurance_expiry: empData.insurance_expiry ? new Date(empData.insurance_expiry) : null,
          joining_date: empData.joining_date ? new Date(empData.joining_date) : null,
          basic_salary: empData.basic_salary || 0,
          other_allowance: empData.other_allowance || 0,
          saudization_status: empData.saudization_status || null,
          bank_name: empData.bank_name || null,
          bank_account_name: empData.bank_account_name || null,
          bank_iban: empData.bank_iban || null,
          is_active: empData.is_active !== false,
          attachments: empData.attachments || null,
          // Intentionally NOT setting company_id — HR manages these centrally
          company_id: null,
          project_id: null,
        }
      });
      seededCount++;

      // Create bank account record if IBAN or bank name present
      if (empData.bank_iban || empData.bank_name) {
        await prisma.employeeBankAccount.create({
          data: {
            employee_id: employee.id,
            bank_name: empData.bank_name || 'N/A',
            account_name: empData.bank_account_name || empData.name,
            iban: empData.bank_iban || 'N/A',
            is_active: true,
          }
        });
        bankAccountCount++;
      }

      process.stdout.write(`   ✓ ${employee.employee_code} — ${employee.name}\n`);
    } catch (err) {
      errors.push({ code: empData.employee_code, name: empData.name, error: err.message });
      process.stdout.write(`   ❌ SKIP ${empData.employee_code} — ${empData.name}: ${err.message}\n`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('🎉 Import complete!');
  console.log(`   ✅ Employees seeded:     ${seededCount} / ${parsedEmployees.length}`);
  console.log(`   ✅ Bank accounts created: ${bankAccountCount}`);
  console.log(`   ⚠️  Errors/skipped:       ${errors.length}`);
  if (errors.length > 0) {
    console.log('\n   Failed records:');
    errors.forEach(e => console.log(`     - ${e.code} (${e.name}): ${e.error}`));
  }
  console.log('══════════════════════════════════════════════════════\n');
}

// Load parsed employees
const parsedEmployees = require('./parsed_employees.json');

main()
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
