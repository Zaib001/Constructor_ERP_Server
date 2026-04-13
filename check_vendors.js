require("dotenv").config();
const prisma = require("./src/db");

async function main() {
    console.log("--- DIAGNOSTIC: Approval Matrices ---");
    const matrices = await prisma.approvalMatrix.findMany({
        orderBy: [{ doc_type: 'asc' }, { step_order: 'asc' }],
        include: { roles: true, projects: true, company: true }
    });
    matrices.forEach(m => {
        console.log(`ID: ${m.id} | Doc: ${m.doc_type} | Step: ${m.step_order} | Role: ${m.roles?.code} | Project: ${m.projects?.name || 'Global'} | Company: ${m.company?.name} | Range: ${m.min_amount} - ${m.max_amount}`);
    });

    console.log("\n--- DIAGNOSTIC: Recent Approval Requests & Steps ---");
    const requests = await prisma.approvalRequest.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
            approval_steps: {
                include: { roles: true }
            }
        }
    });

    requests.forEach(r => {
        console.log(`\nRequest ID: ${r.id} | Doc: ${r.doc_type} | Amount: ${r.amount} | Status: ${r.current_status} | Current Step: ${r.current_step}`);
        r.approval_steps.forEach(s => {
            console.log(`  Step ID: ${s.id} | Order: ${s.step_order} | Role: ${s.roles?.code} | Status: ${s.status} | Approver: ${s.approver_user || 'Any'}`);
        });
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
