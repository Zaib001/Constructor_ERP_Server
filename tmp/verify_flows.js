"use strict";

require("dotenv").config();
const prisma = require("../src/db");
const quotationsService = require("../src/modules/quotations/quotations.service");
const payrollService = require("../src/modules/payroll/payroll.service");
const expensesService = require("../src/modules/expenses/expenses.service");

async function verify() {
    console.log("🔍 Starting Flow Verification...");

    // 1. Get Employee User
    const employee = await prisma.user.findUnique({
        where: { email: "eng-employee1@mag-civil.com" },
        include: { roles: true }
    });

    if (!employee) {
        console.error("❌ Employee user not found. Run seed_full_flow.js first.");
        return;
    }

    const company = await prisma.company.findFirst({ where: { code: "MAG-CIVIL" } });
    if (!company) {
        console.error("❌ Company not found.");
        return;
    }

    const actorId = employee.id;
    const departmentId = employee.department_id;
    const companyId = company.id;

    console.log(`👤 Actor: ${employee.name} (Role: ${employee.roles.code})`);

    // --- QUOTATION VERIFICATION ---
    console.log("\n--- Testing Quotation Flow ---");
    const quote = await quotationsService.createQuotation({
        company_id: companyId,
        amount: 15000,
        project_id: null
    }, actorId, departmentId);

    console.log(`✅ Quotation created: ${quote.quote_number}, Status: ${quote.status}`);
    
    // Check approval request
    const quoteReq = await prisma.approvalRequest.findFirst({
        where: { doc_type: "QUOTATION", doc_id: quote.id },
        include: { approval_steps: { include: { roles: true } } }
    });

    if (quoteReq) {
        console.log(`✅ Approval Request found. Total steps: ${quoteReq.total_steps}`);
        quoteReq.approval_steps.forEach(s => {
            console.log(`   Step ${s.step_order}: Role ${s.roles.code}, Status: ${s.status}`);
        });
        
        // Check document status update (should be pending_approval)
        const updatedQuote = await prisma.quotation.findUnique({ where: { id: quote.id } });
        console.log(`✅ Quotation Status after requestApproval: ${updatedQuote.status}`);
    } else {
        console.error("❌ Approval Request NOT found for Quotation.");
    }

    // --- PAYROLL VERIFICATION ---
    console.log("\n--- Testing Payroll Flow ---");
    const payroll = await payrollService.createPayroll({
        company_id: companyId,
        total_amount: 50000,
        payroll_month: "2024-03"
    }, actorId, departmentId);

    console.log(`✅ Payroll created, Status: ${payroll.status}`);

    const payrollReq = await prisma.approvalRequest.findFirst({
        where: { doc_type: "PAYROLL", doc_id: payroll.id },
        include: { approval_steps: { include: { roles: true } } }
    });

    if (payrollReq) {
        console.log(`✅ Approval Request found. Total steps: ${payrollReq.total_steps}`);
        payrollReq.approval_steps.forEach(s => {
            console.log(`   Step ${s.step_order}: Role ${s.roles.code}, Status: ${s.status}`);
        });
        
        const updatedPayroll = await prisma.payroll.findUnique({ where: { id: payroll.id } });
        console.log(`✅ Payroll Status after requestApproval: ${updatedPayroll.status}`);
    }

    // --- EXPENSE VERIFICATION (Small) ---
    console.log("\n--- Testing Small Expense Flow (<= 5000) ---");
    const smallExpense = await expensesService.createExpense({
        company_id: companyId,
        amount: 1000,
        category: "Travel",
        description: "Taxi to site"
    }, actorId, departmentId);

    const smallExpReq = await prisma.approvalRequest.findFirst({
        where: { doc_type: "EXPENSE", doc_id: smallExpense.id },
        include: { approval_steps: { include: { roles: true } } }
    });

    if (smallExpReq) {
        console.log(`✅ Approval Request found. Total steps: ${smallExpReq.total_steps} (Expected: 1)`);
        smallExpReq.approval_steps.forEach(s => {
            console.log(`   Step ${s.step_order}: Role ${s.roles.code}`);
        });
        
        const updatedExp = await prisma.expense.findUnique({ where: { id: smallExpense.id } });
        console.log(`✅ Expense Status: ${updatedExp.status}`);
    }

    // --- EXPENSE VERIFICATION (Large) ---
    console.log("\n--- Testing Large Expense Flow (> 5000) ---");
    const largeExpense = await expensesService.createExpense({
        company_id: companyId,
        amount: 8000,
        category: "Materials",
        description: "Emergency supplies"
    }, actorId, departmentId);

    const largeExpReq = await prisma.approvalRequest.findFirst({
        where: { doc_type: "EXPENSE", doc_id: largeExpense.id },
        include: { approval_steps: { include: { roles: true } } }
    });

    if (largeExpReq) {
        console.log(`✅ Approval Request found. Total steps: ${largeExpReq.total_steps} (Expected: 2)`);
        largeExpReq.approval_steps.forEach(s => {
            console.log(`   Step ${s.step_order}: Role ${s.roles.code}`);
        });
    }

    console.log("\n🏁 Verification Complete.");
}

verify().catch(console.error).finally(() => prisma.$disconnect());
