require('dotenv').config();
const prisma = require('../src/db');

const COMPANY_ID = 'bdfdc419-08cc-4572-9f85-adc112a0e961';
const DEPT_HEAD_ROLE_ID = '6597de22-b226-4b1a-901c-41ca593356e8';
const SUPER_ADMIN_ROLE_ID = 'ebae1b4f-5d2f-4e38-a2ef-988f5a8e9e61';

async function seedMatrices() {
  try {
    // ─── 1. Create PR (Purchase Request) matrices ─────────────────────────
    // PR follows the same pattern as QUOTATION:
    //   Step 1: Department Head → Step 2: Super Admin
    console.log('Creating PR approval matrices...');
    await prisma.approvalMatrix.createMany({
      data: [
        {
          doc_type: 'PR',
          project_id: null,        // Global (all projects)
          min_amount: null,
          max_amount: null,
          role_id: DEPT_HEAD_ROLE_ID,
          step_order: 1,
          is_parallel: false,
          is_mandatory: true,
          escalation_hours: null,
          department_id: null,
          company_id: COMPANY_ID,
        },
        {
          doc_type: 'PR',
          project_id: null,
          min_amount: null,
          max_amount: null,
          role_id: SUPER_ADMIN_ROLE_ID,
          step_order: 2,
          is_parallel: false,
          is_mandatory: true,
          escalation_hours: null,
          department_id: null,
          company_id: COMPANY_ID,
        },
      ],
    });
    console.log('✅ PR matrices created (Step 1: Dept Head → Step 2: Super Admin)');

    // ─── 2. Fix VENDOR matrices ───────────────────────────────────────────
    // Current: Only Super Admin (step 1)
    // Required: Dept Head (step 1) → Super Admin (step 2)
    console.log('\nFixing VENDOR approval matrices...');

    // Update existing Super Admin step from step_order 1 → 2
    await prisma.approvalMatrix.updateMany({
      where: {
        doc_type: 'VENDOR',
        role_id: SUPER_ADMIN_ROLE_ID,
        company_id: COMPANY_ID,
      },
      data: { step_order: 2 },
    });

    // Add Dept Head as step 1
    await prisma.approvalMatrix.create({
      data: {
        doc_type: 'VENDOR',
        project_id: null,
        min_amount: null,
        max_amount: null,
        role_id: DEPT_HEAD_ROLE_ID,
        step_order: 1,
        is_parallel: false,
        is_mandatory: true,
        escalation_hours: null,
        department_id: null,
        company_id: COMPANY_ID,
      },
    });
    console.log('✅ VENDOR matrices fixed (Step 1: Dept Head → Step 2: Super Admin)');

    // ─── 3. Fix PROFIT matrices ───────────────────────────────────────────
    // Current: Only Super Admin (step 1)
    // Required: Dept Head (step 1) → Super Admin (step 2)
    console.log('\nFixing PROFIT approval matrices...');

    // Update existing Super Admin step from step_order 1 → 2
    await prisma.approvalMatrix.updateMany({
      where: {
        doc_type: 'PROFIT',
        role_id: SUPER_ADMIN_ROLE_ID,
        company_id: COMPANY_ID,
      },
      data: { step_order: 2 },
    });

    // Add Dept Head as step 1
    await prisma.approvalMatrix.create({
      data: {
        doc_type: 'PROFIT',
        project_id: null,
        min_amount: null,
        max_amount: null,
        role_id: DEPT_HEAD_ROLE_ID,
        step_order: 1,
        is_parallel: false,
        is_mandatory: true,
        escalation_hours: null,
        department_id: null,
        company_id: COMPANY_ID,
      },
    });
    console.log('✅ PROFIT matrices fixed (Step 1: Dept Head → Step 2: Super Admin)');

    // ─── Verify final state ───────────────────────────────────────────────
    console.log('\n═══ Final Approval Matrix Summary ═══\n');
    const allMatrices = await prisma.approvalMatrix.findMany({
      include: { roles: { select: { name: true, code: true } } },
      orderBy: [{ doc_type: 'asc' }, { min_amount: 'asc' }, { step_order: 'asc' }],
    });

    const grouped = {};
    for (const m of allMatrices) {
      const key = `${m.doc_type}${m.min_amount ? ` (${m.min_amount}-${m.max_amount || '∞'})` : ''}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(`  Step ${m.step_order}: ${m.roles.name}`);
    }

    for (const [docType, steps] of Object.entries(grouped)) {
      console.log(`${docType}:`);
      steps.forEach(s => console.log(s));
      console.log('');
    }

  } catch (error) {
    console.error('Error seeding matrices:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedMatrices();
