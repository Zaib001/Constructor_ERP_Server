require('dotenv').config();
const prisma = require("./src/db");
const fs = require('fs');

async function main() {
    const data = {};

    data.companies = await prisma.company.findMany({
        where: { code: { startsWith: 'TEST_' } },
        select: { id: true, name: true, code: true }
    });

    data.departments = await prisma.department.findMany({
        where: { code: { startsWith: 'TEST_' } },
        select: { id: true, name: true, head_id: true, company: { select: { name: true } } }
    });

    data.users = await prisma.user.findMany({
        where: { name: { startsWith: 'TEST_' } },
        select: { 
            id: true, email: true, name: true, designation: true, 
            roles: { select: { name: true, code: true } }, 
            company: { select: { name: true } },
            departments: { select: { name: true } }
        }
    });

    data.projects = await prisma.project.findMany({
        where: { code: { startsWith: 'TEST_' } },
        select: { id: true, name: true, code: true, company: { select: { name: true } } }
    });

    data.vendors = await prisma.vendor.findMany({
        where: { name: { startsWith: 'TEST_' } },
        select: { id: true, name: true, company: { select: { name: true } } }
    });

    data.quotations = await prisma.quotation.findMany({
        where: { quote_number: { startsWith: 'TEST_' } },
        select: { id: true, quote_number: true, amount: true, company: { select: { name: true } } }
    });

    data.pos = await prisma.purchaseOrder.findMany({
        where: { po_number: { startsWith: 'TEST_' } },
        select: { id: true, po_number: true, amount: true, company: { select: { name: true } } }
    });

    data.payrolls = await prisma.payroll.findMany({
        where: { payroll_month: { startsWith: '03-2026' } },
        select: { id: true, payroll_month: true, total_amount: true, company: { select: { name: true } } }
    });

    data.expenses = await prisma.expense.findMany({
        where: { expense_number: { startsWith: 'TEST_' } },
        select: { id: true, expense_number: true, amount: true, category: true, company: { select: { name: true } } }
    });

    const docIds = [
        ...data.quotations.map(q => q.id),
        ...data.pos.map(p => p.id),
        ...data.payrolls.map(p => p.id),
        ...data.expenses.map(e => e.id)
    ];

    data.approval_requests = await prisma.approvalRequest.findMany({
        where: { doc_id: { in: docIds } },
        select: {
            id: true, doc_type: true, doc_id: true, amount: true, current_status: true,
            approval_steps: {
                select: { id: true, step_order: true, status: true, roles: { select: { code: true } }, approver_user: true }
            }
        }
    });

    fs.writeFileSync('gather_output_v2.json', JSON.stringify(data, null, 2), 'utf8');
}

main().catch(console.error).finally(() => prisma.$disconnect());
