/**
 * Batch script: Remove all `deleted_at: null` WHERE clause filters from service files.
 * These cause Prisma validation errors since no model in the schema has a deleted_at column.
 * 
 * NOTE: This does NOT remove `data: { deleted_at: ... }` write patterns or comments.
 */

const fs = require('fs');
const path = require('path');

const SERVICE_DIR = path.join(__dirname, '..', 'src', 'modules');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // Pattern 1: Remove standalone `deleted_at: null,` in where clauses
    // e.g.,  where: { id, deleted_at: null, ... }
    content = content.replace(/,\s*deleted_at:\s*null\b/g, '');
    content = content.replace(/deleted_at:\s*null,\s*/g, '');
    content = content.replace(/deleted_at:\s*null\s*/g, '');

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    }
    return false;
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    let changed = 0;
    for (const file of files) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            changed += walk(full);
        } else if (file.endsWith('.service.js') || file.endsWith('.repository.js')) {
            const wasChanged = processFile(full);
            if (wasChanged) {
                console.log('  CLEANED:', full.replace(SERVICE_DIR, ''));
                changed++;
            }
        }
    }
    return changed;
}

console.log('Scanning service files for deleted_at: null WHERE filters...\n');
const total = walk(SERVICE_DIR);
console.log(`\nDone. ${total} file(s) cleaned.`);
