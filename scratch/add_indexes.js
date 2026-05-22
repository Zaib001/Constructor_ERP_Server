const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schemaContent = fs.readFileSync(schemaPath, 'utf8');

const modifications = {
    "model Attendance {": "  @@index([company_id, date])",
    "model PayrollRun {": "  @@index([company_id, status])",
    "model PayrollItem {": "  @@index([payroll_run_id])\n  @@index([employee_id])",
    "model SalaryRevision {": "  @@index([employee_id, effective_from])",
    "model LeaveRequest {": "  @@index([employee_id, start_date, end_date])\n  @@index([company_id, status])",
    "model OvertimeRequest {": "  @@index([employee_id, date])\n  @@index([company_id, status])",
    "model LaborCostAllocation {": "  @@index([payroll_item_id])\n  @@index([project_id])\n  @@index([department_id])"
};

let modified = false;
for (const [modelHeader, indexContent] of Object.entries(modifications)) {
    // We want to insert the indexContent right before the closing brace '}' of the model definition.
    // Let's find the model block.
    const modelName = modelHeader.split(' ')[1];
    const regex = new RegExp(`model\\s+${modelName}\\s*\\{[\\s\\S]*?\\}`, 'i');
    const match = schemaContent.match(regex);
    if (match) {
        const block = match[0];
        // If index content is already present, skip
        if (block.includes(indexContent.split('\n')[0])) {
            console.log(`Indexes already exist in model ${modelName}`);
            continue;
        }
        // Insert right before the closing brace '}'
        const lastBraceIdx = block.lastIndexOf('}');
        const newBlock = block.substring(0, lastBraceIdx) + '\n' + indexContent + '\n' + block.substring(lastBraceIdx);
        schemaContent = schemaContent.replace(block, newBlock);
        console.log(`Appended indexes to model ${modelName}`);
        modified = true;
    } else {
        console.log(`Could not find model ${modelName} in schema`);
    }
}

if (modified) {
    fs.writeFileSync(schemaPath, schemaContent, 'utf8');
    console.log("schema.prisma updated successfully!");
    
    // Now execute prisma db push to apply to DB
    try {
        console.log("Executing prisma db push...");
        const output = execSync('npx prisma db push', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
        console.log(output);
    } catch (err) {
        console.error("Prisma db push failed:", err.stdout || err.message);
    }
} else {
    console.log("No modifications needed for schema.prisma.");
}
