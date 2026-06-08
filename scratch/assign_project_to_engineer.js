require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    try {
        const email = "engineer@constructionerp.com";
        const user = await prisma.user.findFirst({
            where: { email },
            include: { roles: true }
        });
        if (!user) {
            console.log(`User ${email} not found!`);
            return;
        }

        const project = await prisma.project.findFirst({
            where: {
                company_id: user.company_id,
                code: "PROJ-001"
            }
        });
        if (!project) {
            console.log("Project PROJ-001 not found for company!");
            return;
        }

        console.log(`User: ${user.name} (ID: ${user.id})`);
        console.log(`Project: ${project.name} (ID: ${project.id})`);

        // Check if assignment already exists
        const existing = await prisma.userProject.findFirst({
            where: {
                user_id: user.id,
                project_id: project.id,
                revoked_at: null
            }
        });

        if (existing) {
            console.log(`Assignment already exists: ID ${existing.id}`);
        } else {
            const assignment = await prisma.userProject.create({
                data: {
                    user_id: user.id,
                    project_id: project.id,
                    access_type: 'full',
                    assigned_at: new Date()
                }
            });
            console.log(`Created assignment successfully: ID ${assignment.id}`);
        }
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
