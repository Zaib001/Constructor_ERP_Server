const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const count = await prisma.project.count();
  console.log('Project Count:', count);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
