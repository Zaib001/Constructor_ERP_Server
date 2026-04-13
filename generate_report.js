require('dotenv').config();
const prisma = require("./src/db");
const fs = require('fs');

async function main() {
    let md = "# Final Seeded Test Data Report\n\n";

    // 1. Company B Dept Head
    const headB = await prisma.user.findFirst({
        where: { email: "civil.head.b+test@skyline.com" },
        include: { company: true, departments: true, roles: true }
    });
    md += "## 1. Company B Department Head\n";
    md += `- **Name**: ${headB?.name}\n- **Email**: ${headB?.email}\n- **Role**: ${headB?.roles?.name}\n- **Company**: ${headB?.company?.name}\n- **Department**: ${headB?.departments?.name}\n\n`;

    // 2. HR Users (Both Companies)
    const hrs = await prisma.user.findMany({
        where: { designation: { contains: "HR" }, name: { startsWith: "TEST_" } },
        include: { company: true, departments: true, roles: true }
    });
    md += "## 2. HR / Designation-Based Users\n";
    for (const hr of hrs) {
        md += `- **Name**: ${hr.name}\n  - **Email**: ${hr.email}\n  - **Role**: ${hr.roles?.name} (${hr.designation})\n  - **Company**: ${hr.company?.name}\n  - **Department**: ${hr.departments?.name}\n`;
    }
    md += "\n";

    // 3. Quotations
    const quotes = await prisma.quotation.findMany({
        where: { quote_number: { startsWith: "TEST_" } },
        include: { company: true }
    });
    md += "## 3. Quotations\n";
    for (const q of quotes) {
        md += `- **Quote No**: ${q.quote_number}\n  - **ID**: ${q.id}\n  - **Amount**: $${q.amount}\n  - **Company**: ${q.company?.name}\n`;
    }
    md += "\n";

    // 4. Payrolls
    const payrolls = await prisma.payroll.findMany({
        where: { payroll_month: { startsWith: "03-2026" } },
        include: { company: true }
    });
    md += "## 4. Payroll Records\n";
    for (const p of payrolls) {
        md += `- **Payroll Month**: ${p.payroll_month}\n  - **ID**: ${p.id}\n  - **Amount**: $${p.total_amount}\n  - **Company**: ${p.company?.name}\n`;
    }
    md += "\n";

    // 5. Expenses
    const expenses = await prisma.expense.findMany({
        where: { expense_number: { startsWith: "TEST_" } },
        include: { company: true }
    });
    md += "## 5. Expense Records\n";
    for (const e of expenses) {
        md += `- **Expense No**: ${e.expense_number}\n  - **ID**: ${e.id}\n  - **Amount**: $${e.amount} (${e.category})\n  - **Company**: ${e.company?.name}\n`;
    }
    md += "\n";

    // 6. Approval Requests & Steps
    const reqs = await prisma.approvalRequest.findMany({
        where: { current_status: "in_progress", amount: { gt: 0 } },
        include: {
            company: true,
            approval_steps: {
                orderBy: { step_order: 'asc' },
                include: { roles: true }
            }
        }
    });

    md += "## 6. Approval Requests Generated\n";
    for (const r of reqs) {
        md += `- **Request Type**: ${r.doc_type} for ID: ${r.doc_id}\n`;
        md += `  - **Request ID**: ${r.id}\n`;
        md += `  - **Company**: ${r.company?.name || "Global"}\n`;
        md += `  - **Amount**: $${r.amount}\n`;
        md += `  - **Status**: ${r.current_status} (Step ${r.current_step} of ${r.total_steps})\n`;
        md += `  - **Steps**:\n`;
        for (const s of r.approval_steps) {
            md += `    - Step ${s.step_order}: Pending (Assigned to ID: ${s.approver_user})\n`;
        }
    }

    fs.writeFileSync('FINAL_REPORT.md', md, 'utf8');
}

main().catch(console.error).finally(() => prisma.$disconnect());
