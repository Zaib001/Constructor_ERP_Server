const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const perm = await prisma.permission.findFirst({
    where: { name: 'item.create' },
    include: {
      roles: {
        select: {
          code: true,
          name: true
        }
      }
    }
  });
  console.log(JSON.stringify(perm, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
