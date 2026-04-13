require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function debug() {
    console.log("Starting Resilient Debug...");
    try {
        const email = "engineer@erp.com";
        const user = await prisma.user.findUnique({ 
            where: { email },
            include: { role: true }
        });

        if (!user) {
            console.log(`User '${email}' not found!`);
            const allUsers = await prisma.user.findMany({ select: { email: true } });
            console.log("Available users:", allUsers.map(u => u.email).join(", "));
            return;
        }

        console.log(`User Found: ${user.name} (${user.id})`);
        console.log(`Role: ${user.role?.code}`);
        console.log(`Company ID: ${user.company_id}`);

        const targetProjectId = "51f27170-49f3-4a0c-a3d9-75e87a23944c";
        console.log(`\nAnalyzing Project: ${targetProjectId}`);

        const project = await prisma.project.findUnique({ where: { id: targetProjectId } });
        if (!project) {
            console.log(" - Project not found in DB.");
        } else {
            console.log(` - Project found: '${project.name}'`);
            console.log(` - Project Company ID: ${project.company_id}`);
            
            const assignments = await prisma.userProject.findMany({
                where: { user_id: user.id, project_id: targetProjectId }
            });
            console.log(` - Assignments for this project: ${assignments.length}`);
            assignments.forEach(a => console.log(`   - ID: ${a.id}, Revoked: ${a.revoked_at}, Access: ${a.access_type}`));

            // Test the exact query from any service
            const result = await prisma.project.findFirst({
                where: {
                    id: targetProjectId,
                    company_id: user.company_id,
                    user_projects: {
                        some: {
                            user_id: user.id,
                            revoked_at: null
                        }
                    }
                }
            });
            console.log(`\nQuery Result (Direct scoping): ${result ? "SUCCESS" : "FAILED"}`);
        }
    } catch (err) {
        console.error("DEBUG ERROR:", err);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
