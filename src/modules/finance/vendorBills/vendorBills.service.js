"use strict";

const prisma = require("../../../db");
const { generateSequenceNo, checkPeriodGuard, resolveAccount } = require("../finance.utils");
const { requestApproval } = require("../../approvals/approvals.service");
const { registerAdapter } = require("../../approvals/approvals.adapter");

const logger = require("../../../logger");

// 1. Register Approval Adapter for Vendor Bills
registerAdapter("VENDOR_BILL", async ({ docId, status, userId, companyId }) => {
    await prisma.vendorBill.update({
        where: { id: docId, company_id: companyId },
        data: { document_status: status }
    });

    // Auto-post to ledger if approved
    if (status === "approved") {
        try {
            await postBill(docId, companyId, userId);
        } catch (err) {
            logger.error(`Auto-post failed for Bill ${docId}:`, err.message);
        }
    }
});

const getBills = async (companyId, filters = {}) => {
    return await prisma.vendorBill.findMany({
        where: {
            company_id: companyId,
            ...filters
        },
        include: {
            vendor: true,
            project: true,
            items: true
        },
        orderBy: { bill_date: "desc" }
    });
};

const createBill = async (companyId, data, userId) => {
    await checkPeriodGuard(companyId, data.bill_date);

    const bill_no = await generateSequenceNo(companyId, "VENDOR_BILL", "VBL");
    const { items, ...billData } = data;

    const bill = await prisma.vendorBill.create({
        data: {
            ...billData,
            company_id: companyId,
            bill_no,
            created_by: userId,
            document_status: "draft",
            items: {
                create: items
            }
        }
    });

    // Trigger Approval Workflow
    if (Number(bill.net_payable) > 0) {
        await requestApproval({
            docType: "VENDOR_BILL",
            docId: bill.id,
            projectId: bill.project_id,
            amount: bill.net_payable,
            companyId: companyId
        }, userId);
    }

    return bill;
};

/**
 * Post a vendor bill to the ledger
 */
const postBill = async (id, companyId, userId) => {
    return await prisma.$transaction(async (tx) => {
        const bill = await tx.vendorBill.findUnique({
            where: { id, company_id: companyId },
            include: { vendor: true, project: true }
        });

        if (!bill) throw new Error("Vendor bill not found.");
        if (bill.document_status !== "approved") throw new Error("Bill must be approved before posting.");
        if (bill.posting_status === "posted") throw new Error("Bill is already posted.");

        await checkPeriodGuard(companyId, bill.bill_date);

        // Resolve Dynamic Accounts
        const costAccount = await resolveAccount(companyId, 'PROJECT_COST');
        const vatRecAccount = await resolveAccount(companyId, 'VAT_RECOVERABLE');
        const apAccount = await resolveAccount(companyId, 'ACCOUNTS_PAYABLE');

        // 1. Create Voucher
        const voucher_no = await generateSequenceNo(companyId, "VOUCHER", "VCH");
        const voucher = await tx.voucher.create({
            data: {
                company_id: companyId,
                voucher_no,
                voucher_type: "PAYMENT",
                event_type: "VENDOR_BILL_POSTED",
                posting_date: bill.bill_date,
                narration: `Vendor Bill ${bill.bill_no} from ${bill.vendor?.name}`,
                total_debit: bill.net_payable,
                total_credit: bill.net_payable,
                status: "posted",
                reference_type: "VENDOR_BILL",
                reference_id: bill.id,
                created_by: userId,
                posted_by: userId,
                posted_at: new Date()
            }
        });

        // 2. Ledger Entries
        // DR Cost
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: costAccount.id,
                debit: bill.subtotal,
                credit: 0,
                narration: `Cost for Bill ${bill.bill_no}`,
                posting_date: bill.bill_date,
                project_id: bill.project_id
            }
        });

        // DR VAT Recoverable
        if (Number(bill.vat_amount) > 0) {
            await tx.ledgerEntry.create({
                data: {
                    company_id: companyId,
                    voucher_id: voucher.id,
                    account_id: vatRecAccount.id,
                    debit: bill.vat_amount,
                    credit: 0,
                    narration: `VAT Recoverable for Bill ${bill.bill_no}`,
                    posting_date: bill.bill_date,
                    project_id: bill.project_id
                }
            });
        }

        // CR AP
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: apAccount.id,
                debit: 0,
                credit: bill.net_payable,
                narration: `AP for Bill ${bill.bill_no}`,
                posting_date: bill.bill_date,
                project_id: bill.project_id
            }
        });

        // 3. Update Bill
        return await tx.vendorBill.update({
            where: { id },
            data: {
                posting_status: "posted",
                approved_by: userId,
                approved_at: new Date(),
                voucher_id: voucher.id,
                outstanding: bill.net_payable 
            }
        });
    });
};

module.exports = {
    getBills,
    createBill,
    postBill
};
