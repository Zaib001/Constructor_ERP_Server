const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

const lines = schemaContent.split(/\r?\n/);
const models = [];
for (let line of lines) {
    const match = line.match(/^\s*model\s+(\w+)\s*\{/);
    if (match) {
        models.push(match[1]);
    }
}

console.log("Found models count:", models.length);
console.log(JSON.stringify(models.sort(), null, 2));
