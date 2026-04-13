const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function debug() {
    console.log("Starting Debug...");
    try {
        const email = "engineer@erp.com";
        const user = await prisma.user.findUnique({ 
            where: { email },
            include: { role: true }
        });

        if (!user) {
            console.log("User 'engineer@erp.com' not found!");
            return;
        }

        console.log(`User: ${user.name} (${user.id})`);
        console.log(`Role: ${user.role.code}`);
        console.log(`Company ID: ${user.company_id}`);

        const assignments = await prisma.userProject.findMany({
            where: { user_id: user.id, revoked_at: null },
            include: { project: true }
        });

        console.log(`Active Project Assignments: ${assignments.length}`);
        assignments.forEach(a => {
            console.log(` - Project: ${a.project.name} (${a.project.id}) [Code: ${a.project.code}]`);
        });

        const targetProjectId = "51f27170-49f3-4a0c-a3d9-75e87a23944c";
        console.log(`\nTesting access to Project ID: ${targetProjectId}`);

        const project = await prisma.project.findFirst({
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

        console.log(`Result of access-scoped query: ${project ? "SUCCESS (Found)" : "FAILED (Not Found)"}`);

        if (!project) {
            console.log("\nDiagnostics:");
            const rawProject = await prisma.project.findUnique({ where: { id: targetProjectId } });
            if (!rawProject) {
                console.log(" - Project ID does not exist in the database.");
            } else {
                console.log(` - Project exists: '${rawProject.name}'`);
                console.log(` - Project Company ID: ${rawProject.company_id}`);
                if (rawProject.company_id !== user.company_id) {
                    console.log(" - FAILURE REASON: Company mismatch between user and project.");
                } else {
                    const isAssigned = assignments.some(a => a.project_id === targetProjectId);
                    if (!isAssigned) {
                        console.log(" - FAILURE REASON: User is not assigned to this project in UserProject table.");
                    } else {
                        console.log(" - FAILURE REASON: Query logic error (relation name mismatch?)");
                    }
                }
            }
        }
    } catch (err) {
        console.error("Debug Error:", err);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
