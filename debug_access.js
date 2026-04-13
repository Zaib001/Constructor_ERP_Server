require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugAccess() {
    const projectId = "51f27170-49f3-4a0c-a3d9-75e87a23944c";
    
    try {
        console.log("--- PROJECT INFO ---");
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        console.log(project ? project : "Project not found!");

        console.log("\n--- ACTIVE ASSIGNMENTS ---");
        const assignments = await prisma.userProject.findMany({
            where: { project_id: projectId, revoked_at: null },
            include: { users: { select: { id: true, name: true, email: true, roles: { select: { code: true } } } } }
        });
        
        if (assignments.length === 0) {
            console.log("No active assignments for this project.");
        } else {
            assignments.forEach(a => {
                console.log(`- ${a.users?.name} (${a.users?.email}) | Role: ${a.users?.roles?.code} | Access: ${a.access_type}`);
            });
        }

        console.log("\n--- ALL USERS ---");
        const engineers = await prisma.user.findMany({
            where: { roles: { code: "site_engineer" } },
            select: { id: true, name: true, email: true }
        });
        console.log("Site Engineers in DB:", engineers);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

debugAccess();
