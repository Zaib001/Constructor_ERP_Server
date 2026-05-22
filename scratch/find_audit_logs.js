const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

const regexAudit = /model\s+AuditLog\s*\{([\s\S]*?)\}/i;
const regexPayrollAudit = /model\s+PayrollAuditLog\s*\{([\s\S]*?)\}/i;

const matchAudit = schemaContent.match(regexAudit);
const matchPayrollAudit = schemaContent.match(regexPayrollAudit);

if (matchAudit) console.log(matchAudit[0]);
if (matchPayrollAudit) console.log(matchPayrollAudit[0]);
