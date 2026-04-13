require('dotenv').config();
const prisma = require('../src/db');

async function debugProjectAccess() {
    console.log('--- DIAGNOSING PROJECT ACCESS DATA ---');

    // 1. Projects
    const projects = await prisma.project.findMany({ where: { status: 'active' } });
    console.log(`Active Projects found: ${projects.length}`);
    projects.forEach(p => console.log(`  - [${p.id}] ${p.name} (Code: ${p.code})`));

    // 2. Users
    const users = await prisma.user.findMany({ where: { deleted_at: null, is_active: true } });
    console.log(`\nActive Users found: ${users.length}`);

    // 3. Current Assignments (UserProject)
    const assignments = await prisma.userProject.findMany({
        where: { revoked_at: null },
        include: {
            users: { select: { name: true, email: true } },
            projects: { select: { name: true } }
        }
    });
    console.log(`\nActive Assignments (user_projects) found: ${assignments.length}`);
    assignments.forEach(a => {
        console.log(`  - User: ${a.users?.name} (${a.users?.email})`);
        console.log(`    Project: ${a.projects?.name}`);
        console.log(`    Type: ${a.access_type}`);
    });

    // 4. Check for any revoked assignments just in case
    const revoked = await prisma.userProject.findMany({
        where: { NOT: { revoked_at: null } }
    });
    console.log(`\nRevoked Assignments found: ${revoked.length}`);

    await prisma.$disconnect();
}

debugProjectAccess().catch(err => {
    console.error('Diagnosis failed:', err);
    process.exit(1);
});
