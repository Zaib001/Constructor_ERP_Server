const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function check() {
    try {
        const users = await prisma.user.findMany({
            include: { role: true }
        });
        console.log("USERS:");
        users.forEach(u => console.log(`- ${u.email} [${u.id}] Role: ${u.role?.code} Co: ${u.company_id}`));

        const projects = await prisma.project.findMany();
        console.log("\nPROJECTS:");
        projects.forEach(p => console.log(`- ${p.name} [${p.id}] Co: ${p.company_id}`));

        const up = await prisma.userProject.findMany();
        console.log("\nUSER_PROJECTS (Assignments):");
        up.forEach(u => console.log(`- User: ${u.user_id} Project: ${u.project_id} Revoked: ${u.revoked_at}`));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
