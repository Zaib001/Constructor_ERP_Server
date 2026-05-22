"use strict";

const crypto = require("crypto");
const prisma = require("../../../db");
const logger = require("../../../logger");
const { calculateEmployeePayroll } = require("./payroll.engine");
const { triggerProfitabilitySync } = require("./allocation.service");

/**
 * Creates a DRAFT Payroll Run for a specific period.
 * Protects against duplicate runs and overlapping periods.
 */
async function draftPayrollRun(companyId, periodMonth, creatorId, externalTx) {
    const execute = async (tx) => {
        // 1. Check if run exists
        const existing = await tx.payrollRun.findUnique({
            where: { company_id_period_month: { company_id: companyId, period_month: periodMonth } }
        });

        if (existing) {
            if (existing.status === "APPROVED" || existing.status === "POSTED") {
                throw new Error("Payroll is locked for this period. Retroactive adjustment required.");
            }
            // Clear existing draft items
            await tx.payrollItem.deleteMany({ where: { payroll_run_id: existing.id } });
            await tx.payrollRun.delete({ where: { id: existing.id } });
        }

        const run = await tx.payrollRun.create({
            data: {
                company_id: companyId,
                period_month: periodMonth,
                status: "DRAFT",
                processed_by: creatorId
            }
        });

        const activeEmployees = await tx.employee.findMany({
            where: { company_id: companyId, is_active: true }
        });

        let totalGross = 0;
        let totalNet = 0;
        let totalDeduction = 0;

        for (const emp of activeEmployees) {
            const payroll = await calculateEmployeePayroll(emp.id, periodMonth, tx);
            
            await tx.payrollItem.create({
                data: {
                    payroll_run_id: run.id,
                    employee_id: emp.id,
                    basic_salary: payroll.basic_salary,
                    allowances: payroll.allowances,
                    overtime_pay: payroll.overtime_pay,
                    deductions: payroll.deductions,
                    net_salary: payroll.net_salary,
                    breakdown: payroll.breakdown
                }
            });

            totalGross += (payroll.basic_salary + payroll.allowances + payroll.overtime_pay);
            totalNet += payroll.net_salary;
            totalDeduction += payroll.deductions;
        }

        // Update run totals
        return tx.payrollRun.update({
            where: { id: run.id },
            data: {
                total_gross: totalGross,
                total_net: totalNet,
                total_deduction: totalDeduction,
                status: "VALIDATED"
            }
        });
    };

    if (externalTx) {
        return execute(externalTx);
    } else {
        return prisma.$transaction(execute, { maxWait: 15000, timeout: 30000 });
    }
}

/**
 * Generates immutable payslips with cryptographic hashes.
 */
async function generatePayslipsForRun(tx, runId) {
    const items = await tx.payrollItem.findMany({
        where: { payroll_run_id: runId },
        include: { employee: true, payroll_run: true }
    });

    for (const item of items) {
        const payloadStr = JSON.stringify({
            employeeId: item.employee_id,
            period: item.payroll_run.period_month,
            netSalary: Number(item.net_salary),
            breakdown: item.breakdown,
            timestamp: new Date().toISOString()
        });

        const hash = crypto.createHash("sha256").update(payloadStr).digest("hex");

        await tx.payslip.upsert({
            where: { payroll_item_id: item.id },
            update: { integrity_hash: hash },
            create: {
                payroll_item_id: item.id,
                employee_id: item.employee_id,
                integrity_hash: hash,
                is_published: true
            }
        });
    }
}

/**
 * Approves and Locks a Payroll Run immutably.
 */
async function approveAndLockPayroll(runId, approverId, externalTx) {
    const execute = async (tx) => {
        const run = await tx.payrollRun.findUnique({
            where: { id: runId },
            include: { items: true }
        });

        if (!run) throw new Error("Payroll run not found");
        if (run.status !== "VALIDATED") throw new Error("Payroll must be in VALIDATED state to approve.");

        await tx.payrollApproval.create({
            data: {
                payroll_run_id: run.id,
                approved_by_id: approverId,
                status: "APPROVED"
            }
        });

        await generatePayslipsForRun(tx, run.id);

        const lockedRun = await tx.payrollRun.update({
            where: { id: run.id },
            data: {
                status: "APPROVED",
                locked_at: new Date()
            }
        });

        // Generate Immutable Snapshot
        const snapshotPayload = JSON.stringify(lockedRun);
        const snapshotHash = crypto.createHash("sha256").update(snapshotPayload).digest("hex");

        await tx.payrollSnapshot.create({
            data: {
                company_id: run.company_id,
                period_month: run.period_month,
                snapshot_data: JSON.parse(snapshotPayload),
                hash: snapshotHash
            }
        });

        await tx.payrollAuditLog.create({
            data: {
                company_id: run.company_id,
                action: "PAYROLL_APPROVED_AND_LOCKED",
                user_id: approverId,
                details: { run_id: run.id, hash: snapshotHash }
            }
        });

        return lockedRun;
    };

    if (externalTx) {
        return execute(externalTx);
    } else {
        return prisma.$transaction(execute, { maxWait: 15000, timeout: 30000 });
    }
}

/**
 * Reverses an approved payroll.
 */
async function reversePayroll(runId, requestorId, reason) {
    return prisma.$transaction(async (tx) => {
        const run = await tx.payrollRun.findUnique({ where: { id: runId } });
        if (!run) throw new Error("Payroll run not found");
        if (run.status === "POSTED") {
            const voucher = await tx.voucher.findFirst({
                where: {
                    company_id: run.company_id,
                    event_type: "PAYROLL",
                    narration: { contains: run.period_month },
                    status: "posted"
                },
                include: { ledger_entries: true }
            });

            if (voucher) {
                const { generateSequenceNo } = require("../../finance/finance.utils");
                const reversalVoucherNo = await generateSequenceNo(run.company_id, "VOUCHER", "REV");
                
                const reversalVoucher = await tx.voucher.create({
                    data: {
                        company_id: run.company_id,
                        voucher_no: reversalVoucherNo,
                        voucher_type: voucher.voucher_type,
                        event_type: "REVERSAL",
                        posting_date: new Date(),
                        narration: `Reversal of ${voucher.voucher_no} (Payroll reversal). Reason: ${reason || "Not specified"}`,
                        total_debit: voucher.total_credit,
                        total_credit: voucher.total_debit,
                        status: "posted",
                        reversal_of_voucher_id: voucher.id,
                        created_by: requestorId,
                        posted_by: requestorId,
                        posted_at: new Date()
                    }
                });

                for (const entry of voucher.ledger_entries) {
                    await tx.ledgerEntry.create({
                        data: {
                            company_id: run.company_id,
                            voucher_id: reversalVoucher.id,
                            account_id: entry.account_id,
                            debit: entry.credit,
                            credit: entry.debit,
                            narration: `Reversal of entry from ${voucher.voucher_no}`,
                            posting_date: reversalVoucher.posting_date,
                            project_id: entry.project_id,
                            cost_center_id: entry.cost_center_id
                        }
                    });
                }

                await tx.voucher.update({
                    where: { id: voucher.id },
                    data: { status: "reversed" }
                });
            }
        }

        const revSuffix = `_REV_${Date.now()}`;
        const newPeriodMonth = `${run.period_month}${revSuffix}`;

        // Rename run and set status to REVERSED
        await tx.payrollRun.update({
            where: { id: runId },
            data: { 
                status: "REVERSED",
                period_month: newPeriodMonth
            }
        });

        // Rename matching snapshots as well
        await tx.payrollSnapshot.updateMany({
            where: { company_id: run.company_id, period_month: run.period_month },
            data: { period_month: newPeriodMonth }
        });

        // Unpublish/Archive related payslips
        const items = await tx.payrollItem.findMany({
            where: { payroll_run_id: runId }
        });
        for (const item of items) {
            await tx.payslip.updateMany({
                where: { payroll_item_id: item.id },
                data: { is_published: false }
            });
        }

        // Reverse Labor Cost Allocations (insert negative entries)
        const allocations = await tx.laborCostAllocation.findMany({
            where: { payroll_run_id: runId }
        });
        
        for (const alloc of allocations) {
            await tx.laborCostAllocation.create({
                data: {
                    payroll_run_id: alloc.payroll_run_id,
                    payroll_item_id: alloc.payroll_item_id,
                    project_id: alloc.project_id,
                    department_id: alloc.department_id,
                    amount: Number(alloc.amount) * -1, // negate amount
                    percentage: Number(alloc.percentage) * -1, // negate percentage
                    type: alloc.type
                }
            });
        }

        // Trigger Profitability Sync Subtraction
        await triggerProfitabilitySync(run.company_id, runId, tx, "PAYROLL_REVERSAL");

        await tx.payrollAuditLog.create({
            data: {
                company_id: run.company_id,
                action: "PAYROLL_REVERSED",
                user_id: requestorId,
                details: { run_id: runId, reason, old_period_month: run.period_month, new_period_month: newPeriodMonth }
            }
        });

        return { message: "Payroll reversed successfully. You can now re-run the draft." };
    }, { maxWait: 20000, timeout: 60000 });
}

module.exports = {
    draftPayrollRun,
    approveAndLockPayroll,
    reversePayroll
};

