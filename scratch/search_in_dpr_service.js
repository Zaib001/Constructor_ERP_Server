const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/modules/execution/dpr/dpr.service.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

const keywords = ['requestApproval', 'submit', 'matrix', 'approve', 'reviewed_by'];

for (let i = 0; i < lines.length; i++) {
    for (const kw of keywords) {
        if (lines[i].includes(kw)) {
            console.log(`${i + 1}: ${lines[i]}`);
            break;
        }
    }
}
