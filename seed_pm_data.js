const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedData() {
    try {
        // 1. Find or Create HOOPOE and SKYLINE projects
        // We assume they belong to the first active company found
        const company = await prisma.company.findFirst({ where: { is_active: true } });
        if (!company) {
            console.error('No active company found to assign projects to.');
            return;
        }

        console.log(`Using Company: ${company.name} (${company.id})`);

        const projectNames = ['HOOPOE', 'SKYLINE'];
        const projects = [];

        for (const name of projectNames) {
            let p = await prisma.project.findFirst({
                where: { name: { contains: name, mode: 'insensitive' } }
            });

            if (!p) {
                console.log(`Project ${name} not found. Creating...`);
                p = await prisma.project.create({
                    data: {
                        name: `${name}_Construction`,
                        code: `${name}_001`,
                        status: 'active',
                        company_id: company.id,
                        budget: 500000,
                        revenue: 0,
                        cost: 0
                    }
                });
            }
            projects.push(p);
            console.log(`Project Ready: ${p.name} (${p.id})`);
        }

        // 2. Find or Create Project Managers
        // We'll look for users with 'PM' in their name or who are already Staff
        const pmUsers = [];
        for (const p of projects) {
            const pmName = `PM_${p.name.split('_')[0]}`;
            let user = await prisma.user.findFirst({
                where: { name: { contains: pmName, mode: 'insensitive' } }
            });

            if (!user) {
                console.log(`User ${pmName} not found. Creating...`);
                user = await prisma.user.create({
                    data: {
                        name: pmName,
                        email: `${pmName.toLowerCase()}@erp.com`,
                        password: 'hashed_password_placeholder', // Should be a real hash in production
                        username: pmName.toLowerCase(),
                        is_active: true,
                        company_id: company.id,
                        role_id: (await prisma.role.findFirst({ where: { name: 'Staff' } }))?.id
                    }
                });
            }
            pmUsers.push(user);
            console.log(`User Ready: ${user.name} (${user.id})`);

            // 3. Assign as Project Manager
            // Check if already assigned
            const existingAssignment = await prisma.userProject.findFirst({
                where: { user_id: user.id, project_id: p.id }
            });

            if (!existingAssignment) {
                await prisma.userProject.create({
                    data: {
                        user_id: user.id,
                        project_id: p.id,
                        access_type: 'project_manager',
                        assigned_at: new Date()
                    }
                });
                console.log(`Assigned ${user.name} as PM for ${p.name}`);
            } else {
                console.log(`${user.name} is already assigned to ${p.name}`);
            }
        }

        console.log('Seeding completed successfully.');

    } catch (err) {
        console.error('Seeding Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

seedData();
