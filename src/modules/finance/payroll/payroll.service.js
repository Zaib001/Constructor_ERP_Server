"use strict";

const prisma = require("../../../db");
const { generateSequenceNo, checkPeriodGuard, resolveAccount } = require("../finance.utils");

const getSalarySummaries = async (companyId, filters = {}) => {
    return await prisma.departmentSalarySummary.findMany({
        where: {
            company_id: companyId,
            ...filters
        },
        include: {
            department: true,
            finalizer: true
        },
        orderBy: { period_month: "desc" }
    });
};

const createSalarySummary = async (companyId, data) => {
    return await prisma.departmentSalarySummary.create({
        data: {
            ...data,
            company_id: companyId,
            status: "draft"
        }
    });
};

/**
 * Finalize a salary summary
 */
const finalizeSalarySummary = async (id, companyId, userId) => {
    return await prisma.departmentSalarySummary.update({
        where: { id, company_id: companyId },
        data: {
            status: "finalized",
            finalized_by: userId,
            finalized_at: new Date()
        }
    });
};

/**
 * Mark salary summary as paid and post to ledger
 */
const paySalarySummary = async (id, companyId, userId) => {
    return await prisma.$transaction(async (tx) => {
        const summary = await tx.departmentSalarySummary.findUnique({
            where: { id, company_id: companyId },
            include: { department: true }
        });

        if (!summary) throw new Error("Salary summary not found.");
        if (summary.status !== "finalized") throw new Error("Salary summary must be finalized before payment.");

        // 1. Check Period Guard
        await checkPeriodGuard(companyId, new Date());

        // 2. Resolve Accounts
        const expAccount = await resolveAccount(companyId, 'PAYROLL_EXPENSE');
        const payableAccount = await resolveAccount(companyId, 'PAYROLL_PAYABLE');

        const voucher_no = await generateSequenceNo(companyId, "VOUCHER", "VCH");
        
        // 3. Create Voucher
        const voucher = await tx.voucher.create({
            data: {
                company_id: companyId,
                voucher_no,
                voucher_type: "PAYMENT",
                event_type: "PAYROLL_POSTED",
                posting_date: new Date(),
                narration: `Payroll payment for ${summary.department?.name} - ${summary.period_month}`,
                total_debit: summary.total_gross,
                total_credit: summary.total_gross,
                status: "posted",
                reference_type: "SALARY_SUMMARY",
                reference_id: summary.id,
                created_by: userId,
                posted_by: userId,
                posted_at: new Date()
            }
        });

        // 4. Ledger Entries
        // DR Salary Expense (Gross)
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: expAccount.id,
                debit: summary.total_gross,
                credit: 0,
                narration: `Gross salary for ${summary.period_month}`,
                posting_date: voucher.posting_date
            }
        });

        // CR Payroll Payable (Net)
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: payableAccount.id,
                debit: 0,
                credit: summary.total_net,
                narration: `Net salary payable for ${summary.period_month}`,
                posting_date: voucher.posting_date
            }
        });

        // CR Deductions (simplified as Tax/Deduction Payable)
        if (Number(summary.total_deductions) > 0) {
            await tx.ledgerEntry.create({
                data: {
                    company_id: companyId,
                    voucher_id: voucher.id,
                    account_id: payableAccount.id, // For now, or separate TAX_PAYABLE if requested
                    debit: 0,
                    credit: summary.total_deductions,
                    narration: `Salary deductions for ${summary.period_month}`,
                    posting_date: voucher.posting_date
                }
            });
        }

        // 5. Update Summary
        return await tx.departmentSalarySummary.update({
            where: { id },
            data: {
                status: "paid",
                paid_at: new Date(),
                voucher_id: voucher.id
            }
        });
    });
};

const getNotifications = async (companyId, userId) => {
    return await prisma.salaryNotification.findMany({
        where: {
            company_id: companyId,
            is_read: false
        },
        orderBy: { created_at: "desc" }
    });
};

module.exports = {
    getSalarySummaries,
    createSalarySummary,
    finalizeSalarySummary,
    paySalarySummary,
    getNotifications
};
