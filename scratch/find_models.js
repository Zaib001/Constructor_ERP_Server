const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

const targetModels = [
    'PayrollRun', 'PayrollItem', 'Payslip', 'SalaryRevision', 'LaborCostAllocation', 'ChartOfAccount'
];

for (const model of targetModels) {
    const regex = new RegExp(`model\\s+${model}\\s*\\{[\\s\\S]*?\\}`, 'i');
    const match = schemaContent.match(regex);
    if (match) {
        console.log(`=== ${model} ===`);
        console.log(match[0]);
        console.log('\n');
    } else {
        console.log(`=== ${model} not found ===\n`);
    }
}
