require('dotenv').config();
const prisma = require('./src/db');
async function main() {
    try {
        const tasks = await prisma.executionTask.findMany({ include: { project: true, wbs: true, assigned_to: true } });
        console.log("Tasks:", JSON.stringify(tasks, null, 2));
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
