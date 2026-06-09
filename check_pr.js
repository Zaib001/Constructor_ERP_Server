const fs = require('fs');
const content = fs.readFileSync('prisma/schema.prisma', 'utf8');
const lines = content.split('\n');
let insideModel = false;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('model PurchaseRequisition ')) {
        insideModel = true;
    }
    if (insideModel) {
        console.log(`${i+1}: ${line}`);
        if (line.trim() === '}') {
            insideModel = false;
        }
    }
}
