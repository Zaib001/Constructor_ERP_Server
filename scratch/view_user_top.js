const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

const regexUser = /model\s+User\s*\{([\s\S]*?)\}/i;
const matchUser = schemaContent.match(regexUser);
if (matchUser) {
    const lines = matchUser[1].split('\n');
    console.log(lines.slice(0, 30).join('\n'));
}
