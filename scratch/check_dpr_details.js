const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
let content = fs.readFileSync(schemaPath, 'utf8');

const targetModels = ['DPRItem', 'ResourceLog', 'HindranceLog'];

const lines = content.split(/\r?\n/);
let inModel = false;
let modelLines = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('model ')) {
        const name = trimmed.split(/\s+/)[1];
        if (targetModels.includes(name)) {
            inModel = true;
            modelLines.push(`--- Model ${name} ---`);
        }
    }
    if (inModel) {
        modelLines.push(`${i + 1}: ${line}`);
        if (trimmed === '}') {
            inModel = false;
            modelLines.push('');
        }
    }
}

console.log(modelLines.join('\n'));
