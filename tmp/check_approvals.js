require('dotenv').config();
const prisma = require('../src/db');

async function checkApprovals() {
  try {
    const requests = await prisma.approvalRequest.findMany({
      include: {
        approval_steps: {
          orderBy: { step_order: 'asc' },
          include: { roles: { select: { name: true, code: true } } }
        },
        projects: { select: { name: true } },
        departments: { select: { name: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    for (const r of requests) {
      const requester = await prisma.user.findUnique({
        where: { id: r.requested_by },
        select: { name: true, email: true }
      });
      console.log(`\n══════════════════════════════════════`);
      console.log(`Request ID: ${r.id}`);
      console.log(`Doc: ${r.doc_type} / ${r.doc_id}`);
      console.log(`Project: ${r.projects?.name || 'N/A'}`);
      console.log(`Department: ${r.departments?.name || 'N/A'}`);
      console.log(`Requested by: ${requester?.name} (${requester?.email})`);
      console.log(`Status: ${r.current_status} | Step: ${r.current_step}/${r.total_steps} | Completed: ${r.is_completed}`);
      console.log(`Steps:`);
      for (const s of r.approval_steps) {
        const approver = s.approver_user 
          ? await prisma.user.findUnique({ where: { id: s.approver_user }, select: { name: true } })
          : null;
        console.log(`  Step ${s.step_order}: ${s.roles?.name || 'N/A'} | Status: ${s.status} | Approver: ${approver?.name || s.approver_user || 'unassigned'} | Action: ${s.action || '-'}`);
      }
    }

    if (requests.length === 0) {
      console.log('No approval requests found.');
    }
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkApprovals();
