const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/modules/inventory/inventory.service.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('requestApproval')) {
        console.log(`${i + 1}: ${lines[i]}`);
    }
}
