require('dotenv').config();
const prisma = require('../src/db');

async function main() {
    console.log('--- Configuring DPR Approval Matrix ---');

    // 1. Find the Project Manager role
    const pmRole = await prisma.role.findFirst({
        where: { code: 'project_manager' }
    });

    if (!pmRole) {
        console.error('CRITICAL: project_manager role not found. Ensure RBAC is seeded first.');
        process.exit(1);
    }

    // 2. Find any active company to use as target
    const company = await prisma.company.findFirst({ where: { is_active: true } });
    if (!company) {
        console.error('CRITICAL: No active company found.');
        process.exit(1);
    }

    // 3. Clear existing DPR rules to prevent duplicates
    await prisma.approvalMatrix.deleteMany({
        where: { doc_type: 'DPR', company_id: company.id }
    });

    // 4. Insert Step 1: Project Manager
    await prisma.approvalMatrix.create({
        data: {
            doc_type: 'DPR',
            project_id: null, // Global for all projects in this company
            role_id: pmRole.id,
            step_order: 1,
            is_parallel: false,
            is_mandatory: true,
            company_id: company.id,
            department_id: null
        }
    });

    console.log(`✅ DPR Approval Matrix configured (Step 1 -> PM: ${pmRole.name})`);
}

main()
    .catch(err => {
        console.error('FAILED:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
