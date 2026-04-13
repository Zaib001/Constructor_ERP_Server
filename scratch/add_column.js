const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Executing SQL: ALTER TABLE \"auth\".\"execution_tasks\" ADD COLUMN IF NOT EXISTS \"verified_at\" TIMESTAMP(6);");
    await prisma.$executeRawUnsafe(`ALTER TABLE "auth"."execution_tasks" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(6);`);
    console.log("Column 'verified_at' added successfully.");
  } catch (error) {
    console.error("Error adding column:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
