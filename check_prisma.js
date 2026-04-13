const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
console.log("Prisma Models:", Object.keys(prisma).filter(k => k[0] === k[0].toLowerCase() && !k.startsWith('_')));
process.exit(0);
