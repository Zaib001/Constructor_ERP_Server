const prisma = require('./src/db');

console.log('Available models:', Object.keys(prisma).filter(k => k[0] !== '_'));
process.exit(0);
