const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

const regex = /model\s+Shift\s*\{([\s\S]*?)\}/i;
const match = schemaContent.match(regex);
if (match) {
    console.log(match[0]);
} else {
    console.log("Shift model not found");
}
