const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

const regexUser = /model\s+User\s*\{([\s\S]*?)\}/i;
const matchUser = schemaContent.match(regexUser);
if (matchUser) {
    console.log("=== USER MODEL ===");
    console.log(matchUser[0]);
}

const regexEmp = /model\s+Employee\s*\{([\s\S]*?)\}/i;
const matchEmp = schemaContent.match(regexEmp);
if (matchEmp) {
    console.log("=== EMPLOYEE MODEL ===");
    console.log(matchEmp[0]);
}
