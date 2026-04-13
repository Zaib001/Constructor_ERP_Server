const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findProjects() {
    try {
        const hoopoe = await prisma.project.findMany({
            where: { name: { contains: 'HOOPOE', mode: 'insensitive' } }
        });
        const skyline = await prisma.project.findMany({
            where: { name: { contains: 'SKYLINE', mode: 'insensitive' } }
        });

        console.log('HOOPOE Projects:', JSON.stringify(hoopoe, null, 2));
        console.log('SKYLINE Projects:', JSON.stringify(skyline, null, 2));

        // Let's also find all current projects to see if they are named differently
        const allProjects = await prisma.project.findMany({
            select: { id: true, name: true }
        });
        console.log('All Projects:', JSON.stringify(allProjects, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

findProjects();
