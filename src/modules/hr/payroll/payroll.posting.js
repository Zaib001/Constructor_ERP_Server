"use strict";

const prisma = require("../../../db");
const logger = require("../../../logger");
const { generateSequenceNo } = require("../../finance/finance.utils");

/**
 * Creates double-entry General Ledger postings for a posted payroll run.
 */
async function postPayrollToLedger(payrollRunId, creatorId, externalTx) {
    const execute = async (tx) => {
        const run = await tx.payrollRun.findUnique({
            where: { id: payrollRunId },
            include: { company: true }
        });

        if (!run) throw new Error("Payroll run not found");
        if (run.status !== "APPROVED") throw new Error("Only APPROVED payrolls can be posted to the ledger.");

        const expenseAcc = await tx.chartOfAccount.findFirst({
            where: { company_id: run.company_id, account_code: "51000" }
        });
        
        const payableAcc = await tx.chartOfAccount.findFirst({
            where: { company_id: run.company_id, account_code: "21000" }
        });

        if (!expenseAcc || !payableAcc) {
            throw new Error("Standard HR accounts (51000, 21000) not found in Chart of Accounts. Cannot post payroll.");
        }

        // Retrieve or create standard deductions clearing account "22000"
        let clearingAcc = await tx.chartOfAccount.findFirst({
            where: { company_id: run.company_id, account_code: "22000" }
        });
        if (!clearingAcc) {
            clearingAcc = await tx.chartOfAccount.create({
                data: {
                    company_id: run.company_id,
                    account_code: "22000",
                    account_name: "Payroll Deductions Clearing Account",
                    account_type: "Liability",
                    is_control_account: false,
                    is_active: true
                }
            });
        }

        const gross = Number(run.total_gross);
        const net = Number(run.total_net);
        const deductions = Number(run.total_deduction);

        // Verify Gross = Net + Deductions
        if (Math.abs(gross - (net + deductions)) > 0.01) {
            throw new Error(`Financial Discrepancy: Gross Salary (${gross}) must equal Net (${net}) + Deductions (${deductions})`);
        }

        const voucherNo = await generateSequenceNo(run.company_id, "VOUCHER", "VCH", tx);
        const postingNo = await generateSequenceNo(run.company_id, "VOUCHER", "POST", tx);

        const ledgerEntries = [
            {
                company_id: run.company_id,
                account_id: expenseAcc.id,
                debit: gross,
                credit: 0,
                narration: `Salary Expense (Gross) for ${run.period_month}`,
                posting_date: new Date()
            },
            {
                company_id: run.company_id,
                account_id: payableAcc.id,
                debit: 0,
                credit: net,
                narration: `Salaries Payable (Net) for ${run.period_month}`,
                posting_date: new Date()
            }
        ];

        if (deductions > 0) {
            ledgerEntries.push({
                company_id: run.company_id,
                account_id: clearingAcc.id,
                debit: 0,
                credit: deductions,
                narration: `Payroll Deductions Clearing for ${run.period_month}`,
                posting_date: new Date()
            });
        }

        const voucher = await tx.voucher.create({
            data: {
                company_id: run.company_id,
                voucher_no: voucherNo,
                posting_no: postingNo,
                voucher_type: "JV",
                event_type: "PAYROLL",
                posting_date: new Date(),
                narration: `Payroll Run Ledger Posting for ${run.period_month}`,
                total_debit: gross,
                total_credit: gross,
                status: "posted",
                approval_status: "approved",
                created_by: creatorId,
                posted_by: creatorId,
                posted_at: new Date(),
                is_manual: false,
                ledger_entries: {
                    create: ledgerEntries
                }
            }
        });

        // Update run status
        const postedRun = await tx.payrollRun.update({
            where: { id: run.id },
            data: { status: "POSTED" }
        });

        // Mark items as posted
        await tx.payrollItem.updateMany({
            where: { payroll_run_id: run.id },
            data: { is_posted: true }
        });

        await tx.payrollAuditLog.create({
            data: {
                company_id: run.company_id,
                action: "PAYROLL_POSTED_TO_LEDGER",
                user_id: creatorId,
                details: { run_id: run.id, voucher_id: voucher.id }
            }
        });

        return postedRun;
    };

    if (externalTx) {
        return execute(externalTx);
    } else {
        return prisma.$transaction(execute, { maxWait: 15000, timeout: 30000 });
    }
}

module.exports = {
    postPayrollToLedger
};

