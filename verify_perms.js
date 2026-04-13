const fs = require('fs');
const path = require('path');
const re = /requirePermission\((['"`])(.*?)\1\)/g;
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else if (file.endsWith('.routes.js')) {
      const content = fs.readFileSync(file, 'utf8');
      let m;
      while ((m = re.exec(content)) !== null) {
        results.push(path.basename(file) + ': ' + m[2]);
      }
    }
  });
  return results;
}
fs.writeFileSync('d:/Conatruction_ERP/Server/tmp_final.txt', walk('d:/Conatruction_ERP/Server/src/modules').join('\n'));
