const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const tasks = await prisma.executionTask.findMany();
        console.log("Tasks in DB:", JSON.stringify(tasks, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
