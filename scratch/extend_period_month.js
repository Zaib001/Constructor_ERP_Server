const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schemaContent = fs.readFileSync(schemaPath, 'utf8');

// Replace VarChar(7) with VarChar(50) for PayrollRun and PayrollSnapshot
schemaContent = schemaContent.replace(
  /period_month\s+String\s+@db\.VarChar\(7\)/g,
  "period_month   String    @db.VarChar(50)"
);

fs.writeFileSync(schemaPath, schemaContent, 'utf8');
console.log("schema.prisma updated with VarChar(50) for period_month!");

try {
    console.log("Executing prisma db push...");
    const output = execSync('npx prisma db push', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    console.log(output);
} catch (err) {
    console.error("Prisma db push failed:", err.stdout || err.message);
}
