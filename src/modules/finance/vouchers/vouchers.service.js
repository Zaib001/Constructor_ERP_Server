"use strict";

const prisma = require("../../../db");
const { generateSequenceNo, checkPeriodGuard } = require("../finance.utils");
const { requestApproval } = require("../../approvals/approvals.service");
const { registerAdapter } = require("../../approvals/approvals.adapter");
const { logFinancialMutation } = require("../audit/financial.audit");

const logger = require("../../../logger");

// 1. Register Approval Adapter for Manual Vouchers
registerAdapter("MANUAL_VOUCHER", async ({ docId, status, userId, companyId }) => {
    await prisma.voucher.update({
        where: { id: docId, company_id: companyId },
        data: { approval_status: status }
    });

    // Auto-post to ledger if approved (optional enterprise rule)
    if (status === "approved") {
        try {
            await postVoucher(docId, companyId, userId);
        } catch (err) {
            logger.error(`Auto-post failed for Manual Voucher ${docId}:`, err.message);
        }
    }
});

const getVouchers = async (companyId, filters = {}) => {
    return await prisma.voucher.findMany({
        where: {
            company_id: companyId,
            ...filters
        },
        include: {
            ledger_entries: {
                include: {
                    account: true
                }
            }
        },
        orderBy: { posting_date: "desc" }
    });
};

const createVoucher = async (companyId, data, userId) => {
    const { ledger_entries, ...voucherData } = data;
    
    await checkPeriodGuard(companyId, voucherData.posting_date);

    // Calculate totals and validate balance
    const total_debit = ledger_entries?.reduce((sum, e) => sum + (Number(e.debit) || 0), 0) || 0;
    const total_credit = ledger_entries?.reduce((sum, e) => sum + (Number(e.credit) || 0), 0) || 0;

    if (total_debit !== total_credit) {
        throw new Error(`Voucher is not balanced. Total Debit (${total_debit}) != Total Credit (${total_credit})`);
    }

    const voucher_no = await generateSequenceNo(companyId, "VOUCHER", "VCH");
    
    const voucher = await prisma.voucher.create({
        data: {
            ...voucherData,
            company_id: companyId,
            voucher_no,
            total_debit,
            total_credit,
            status: "draft",
            approval_status: "draft",
            created_by: userId,
            is_manual: true,
            ledger_entries: {
                create: (ledger_entries || []).map(entry => ({
                    company_id: companyId,
                    account_id: entry.account_id,
                    debit: entry.debit || 0,
                    credit: entry.credit || 0,
                    narration: entry.narration || voucherData.narration,
                    posting_date: voucherData.posting_date,
                    project_id: entry.project_id,
                    cost_center_id: entry.cost_center_id
                }))
            }
        },
        include: { ledger_entries: true }
    });

    // Trigger Approval Workflow (Manual vouchers always require approval in enterprise)
    await requestApproval({
        docType: "MANUAL_VOUCHER",
        docId: voucher.id,
        projectId: null, // Manual journals might be multi-project, but we can link to a primary or null
        amount: total_debit,
        companyId: companyId
    }, userId);

    return voucher;
};

/**
 * Post a voucher to the ledger
 */
const postVoucher = async (id, companyId, userId) => {
    return await prisma.$transaction(async (tx) => {
        const voucher = await tx.voucher.findUnique({
            where: { id, company_id: companyId },
            include: { ledger_entries: true }
        });

        if (!voucher) throw new Error("Voucher not found.");
        if (voucher.status === "posted") throw new Error("Voucher is already posted.");
        
        // Manual vouchers must be approved
        if (voucher.is_manual && voucher.approval_status !== "approved") {
            throw new Error("Manual voucher must be approved before posting.");
        }

        await checkPeriodGuard(companyId, voucher.posting_date);

        const period = await tx.financialPeriod.findFirst({
            where: {
                company_id: companyId,
                start_date: { lte: voucher.posting_date },
                end_date: { gte: voucher.posting_date }
            }
        });

        const updatedVoucher = await tx.voucher.update({
            where: { id },
            data: {
                status: "posted",
                posted_by: userId,
                posted_at: new Date(),
                period_id: period?.id,
                posting_no: voucher.posting_no || await generateSequenceNo(companyId, "VOUCHER", "POST")
            }
        });

        await tx.ledgerEntry.updateMany({
            where: { voucher_id: id },
            data: { period_id: period?.id }
        });

        await logFinancialMutation({
            companyId,
            userId,
            action: "VOUCHER_POSTED",
            entityType: "Voucher",
            entityId: id,
            after: updatedVoucher
        });

        return updatedVoucher;
    });
};

const reverseVoucher = async (id, companyId, userId, reason) => {
    return await prisma.$transaction(async (tx) => {
        const originalVoucher = await tx.voucher.findUnique({
            where: { id, company_id: companyId },
            include: { ledger_entries: true }
        });

        if (!originalVoucher) throw new Error("Original voucher not found.");
        if (originalVoucher.status !== "posted") throw new Error("Only posted vouchers can be reversed.");

        // Reversal requires period guard too
        await checkPeriodGuard(companyId, new Date());

        const reversalVoucherNo = await generateSequenceNo(companyId, "VOUCHER", "REV");
        
        const reversalVoucher = await tx.voucher.create({
            data: {
                company_id: companyId,
                voucher_no: reversalVoucherNo,
                voucher_type: originalVoucher.voucher_type,
                event_type: "REVERSAL",
                posting_date: new Date(),
                narration: `Reversal of ${originalVoucher.voucher_no}. Reason: ${reason || "Not specified"}`,
                total_debit: originalVoucher.total_credit,
                total_credit: originalVoucher.total_debit,
                status: "posted",
                reversal_of_voucher_id: originalVoucher.id,
                created_by: userId,
                posted_by: userId,
                posted_at: new Date()
            }
        });

        for (const entry of originalVoucher.ledger_entries) {
            await tx.ledgerEntry.create({
                data: {
                    company_id: companyId,
                    voucher_id: reversalVoucher.id,
                    account_id: entry.account_id,
                    debit: entry.credit,
                    credit: entry.debit,
                    narration: `Reversal of entry from ${originalVoucher.voucher_no}`,
                    posting_date: reversalVoucher.posting_date,
                    project_id: entry.project_id,
                    cost_center_id: entry.cost_center_id
                }
            });
        }

        await tx.voucher.update({
            where: { id: originalVoucher.id },
            data: { status: "reversed" }
        });

        await logFinancialMutation({
            companyId,
            userId,
            action: "VOUCHER_REVERSED",
            entityType: "Voucher",
            entityId: originalVoucher.id,
            before: originalVoucher,
            after: reversalVoucher
        });

        return reversalVoucher;
    });
};

module.exports = {
    getVouchers,
    createVoucher,
    postVoucher,
    reverseVoucher
};
