const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

walkDir('src/modules/hr', (filePath) => {
    if (filePath.endsWith('.js')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;
        content = content.replace(/\"\.\.\/\.\.\/\.\.\/\.\.\/db\"/g, '"../../../db"');
        content = content.replace(/\"\.\.\/\.\.\/\.\.\/\.\.\/logger\"/g, '"../../../logger"');
        content = content.replace(/\"\,\s*\"\.\.\/\.\.\/\.\.\/\.\.\/db\"/g, '", "../../../db"');
        content = content.replace(/\"\,\s*\"\.\.\/\.\.\/\.\.\/\.\.\/logger\"/g, '", "../../../logger"');
        content = content.replace(/require\(\"(\.\.\/){4}db\"\)/g, 'require("../../../db")');
        content = content.replace(/require\(\"(\.\.\/){4}logger\"\)/g, 'require("../../../logger")');
        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Fixed paths in ${filePath}`);
        }
    }
});
