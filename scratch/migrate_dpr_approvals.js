require('dotenv').config();
const prisma = require('../src/db');

async function migrate() {
    console.log('--- Migrating ALL Legacy DPRs to Approval System ---');

    const dprs = await prisma.dPR.findMany({
        where: {
            status: { in: ['submitted', 'approved', 'rejected'] },
            deleted_at: null
        },
        include: {
            items: true
        }
    });

    console.log(`Found ${dprs.length} DPRs for migration.`);

    let migrated = 0;
    for (const dpr of dprs) {
        const existing = await prisma.approvalRequest.findFirst({
            where: { doc_type: 'DPR', doc_id: dpr.id }
        });

        if (existing) {
            console.log(`- DPR ${dpr.dpr_no} already has a record. Skipping.`);
            continue;
        }

        console.log(`- Migrating DPR ${dpr.dpr_no} (Status: ${dpr.status})...`);
        
        const requesterId = dpr.submitted_by || dpr.created_by;
        const approverId = dpr.reviewed_by || null;
        const now = new Date();

        try {
            await prisma.$transaction(async (tx) => {
                // 1. Create Request
                const req = await tx.approvalRequest.create({
                    data: {
                        doc_type: 'DPR',
                        doc_id: dpr.id,
                        company_id: dpr.company_id,
                        project_id: dpr.project_id,
                        requested_by: requesterId,
                        current_status: dpr.status === 'submitted' ? 'in_progress' : dpr.status,
                        total_steps: 1,
                        current_step: 1,
                        amount: 0,
                        is_completed: dpr.status !== 'submitted',
                        completed_at: dpr.status !== 'submitted' ? dpr.reviewed_at : null,
                        created_at: dpr.created_at || now,
                    }
                });

                // 2. Create Step
                await tx.approvalStep.create({
                    data: {
                        approval_request_id: req.id,
                        step_order: 1,
                        role_id: (await tx.role.findFirst({ where: { code: 'project_manager' } })).id,
                        approver_user: approverId, // If approved, we record who did it
                        status: dpr.status === 'submitted' ? 'pending' : dpr.status,
                        action: dpr.status === 'submitted' ? null : dpr.status,
                        approved_at: dpr.reviewed_at || (dpr.status !== 'submitted' ? now : null),
                        remarks: 'Legacy data migration'
                    }
                });
            });
            migrated++;
        } catch (err) {
            console.error(`❌ Failed to migrate DPR ${dpr.dpr_no}:`, err.message);
        }
    }

    console.log(`--- Migration Complete: ${migrated} records synced. ---`);
}

migrate()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
