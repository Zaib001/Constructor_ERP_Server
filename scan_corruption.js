/**
 * scan_corruption.js
 * Walks every .js file under src/ and reports any file where:
 *   1. The last non-empty line isn't a clean JS pattern (no alphanumeric stray chars), OR
 *   2. Any line consists solely of a single lowercase letter (like a stray 'l')
 *
 * Usage: node scan_corruption.js > report.txt
 */
const fs = require('fs');
const path = require('path');

const STRAY_LINE_RE = /^\s*[a-z]\s*$/;  // line that is just one letter

function walk(dir, results = []) {
    for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walk(fullPath, results);
        } else if (entry.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

const files = walk(path.join(__dirname, 'src'));

for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split('\n');

    // Check each line for standalone single letter
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/\r$/, '');
        if (STRAY_LINE_RE.test(line)) {
            console.log(`STRAY_CHAR  ${file}:${i + 1}  => ${JSON.stringify(line)}`);
        }
    }

    // Check if last non-empty line has unexpected trailing chars
    const lastLine = lines.slice().reverse().find(l => l.trim().length > 0) || '';
    const tail = lastLine.trimEnd();
    // Flag if it doesn't look like a clean JS ending character
    if (tail !== '' && !/[;}\]'")\d\w]$/.test(tail)) {
        console.log(`DIRTY_TAIL  ${file}  => ${JSON.stringify(tail)}`);
    }
}
