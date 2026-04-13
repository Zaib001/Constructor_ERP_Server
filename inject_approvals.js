require('dotenv').config();
const prisma = require("./src/db");
const fs = require('fs');

async function main() {
    const dataRaw = fs.readFileSync('gather_output_v2.json', 'utf8');
    const data = JSON.parse(dataRaw);

    // We will find the users to assign steps
    const civilHeadA = data.users.find(u => u.name === "TEST_Civil_Head_A").id;
    const civilHeadB = data.users.find(u => u.name === "TEST_Civil_Head_B").id;
    const superAdmin = data.users.find(u => u.name === "TEST_Global_Superadmin").id;
    const pmA = data.users.find(u => u.name === "TEST_PM_A1").id;
    const pmB = data.users.find(u => u.name === "TEST_PM_B1").id;

    async function injectApproval(docType, docId, amount, companyId, reqBy, headId, needTwoSteps) {
        const req = await prisma.approvalRequest.create({
            data: {
                doc_type: docType,
                doc_id: docId,
                requested_by: reqBy,
                current_status: "in_progress",
                total_steps: needTwoSteps ? 2 : 1,
                current_step: 1,
                amount: amount,
                company_id: companyId,
                is_completed: false
            }
        });

        const step1 = await prisma.approvalStep.create({
            data: {
                approval_request_id: req.id,
                step_order: 1,
                approver_user: headId,
                status: "pending",
                escalated: false
            }
        });

        if (needTwoSteps) {
            await prisma.approvalStep.create({
                data: {
                    approval_request_id: req.id,
                    step_order: 2,
                    approver_user: superAdmin,
                    status: "pending",
                    escalated: false
                }
            });
        }
    }

    // Assign Quotations (2 steps)
    for (const q of data.quotations) {
        const head = q.company.name.includes("Hoopoe") ? civilHeadA : civilHeadB;
        const pm = q.company.name.includes("Hoopoe") ? pmA : pmB;
        const comp = data.companies.find(c => c.name === q.company.name).id;
        await injectApproval("Quotation", q.id, Number(q.amount), comp, pm, head, true);
    }

    // Assign POs (1 step if < 50k, 2 steps if >= 50k)
    for (const p of data.pos) {
        if (!p.id) continue;
        const head = p.company.name.includes("Hoopoe") ? civilHeadA : civilHeadB;
        const pm = p.company.name.includes("Hoopoe") ? pmA : pmB;
        const comp = data.companies.find(c => c.name === p.company.name).id;
        await injectApproval("PO", p.id, Number(p.amount), comp, pm, head, Number(p.amount) >= 50000);
    }

    // Assign Payrolls (2 steps)
    for (const p of data.payrolls) {
        const head = p.company.name.includes("Hoopoe") ? civilHeadA : civilHeadB;
        const pm = p.company.name.includes("Hoopoe") ? pmA : pmB;
        const comp = data.companies.find(c => c.name === p.company.name).id;
        await injectApproval("Payroll", p.id, Number(p.total_amount), comp, pm, head, true);
    }

    // Assign Expenses (2 steps)
    for (const p of data.expenses) {
        const head = p.company.name.includes("Hoopoe") ? civilHeadA : civilHeadB;
        const pm = p.company.name.includes("Hoopoe") ? pmA : pmB;
        const comp = data.companies.find(c => c.name === p.company.name).id;
        await injectApproval("Expense", p.id, Number(p.amount), comp, pm, head, true);
    }

    console.log("Approvals injected. Updating gather list.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
