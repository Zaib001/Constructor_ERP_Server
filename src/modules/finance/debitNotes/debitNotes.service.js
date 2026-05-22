"use strict";

const prisma = require("../../../db");
const logger = require("../../../logger");
const { generateSequenceNo, checkPeriodGuard, resolveAccount } = require("../finance.utils");
const { writeVATTransactions } = require("../vat/vat.service");
const { logFinancialMutation } = require("../audit/financial.audit");

/**
 * Get all debit notes
 */
async function getDebitNotes(companyId) {
    return prisma.debitNote.findMany({
        where: { company_id: companyId },
        include: {
            creator: { select: { name: true, email: true } }
        },
        orderBy: { created_at: "desc" }
    });
}

/**
 * Create a new draft Debit Note
 */
async function createDebitNote(companyId, { billId, amount, reason }, userId) {
    const bill = await prisma.vendorBill.findFirst({
        where: { id: billId, company_id: companyId }
    });

    if (!bill) throw new Error("Vendor bill not found.");
    if (bill.posting_status !== "posted") {
        throw new Error("Can only issue Debit Notes against posted vendor bills.");
    }

    const note_no = await generateSequenceNo(companyId, "DEBIT_NOTE", "DN");

    const note = await prisma.debitNote.create({
        data: {
            company_id: companyId,
            bill_id:    billId,
            note_no,
            amount:     amount,
            reason:     reason || "Vendor purchase return",
            status:     "draft",
            created_by: userId
        }
    });

    return note;
}

/**
 * Post a Debit Note
 * Performs balanced ledger postings (DR Accounts Payable, CR Expenses, CR VAT Receivable)
 * and writes inverted input VAT transactions
 */
async function postDebitNote(id, companyId, userId) {
    return prisma.$transaction(async (tx) => {
        const note = await tx.debitNote.findFirst({
            where: { id, company_id: companyId }
        });

        if (!note) throw new Error("Debit Note not found.");
        if (note.status === "posted") throw new Error("Debit Note is already posted.");

        const bill = await tx.vendorBill.findUnique({
            where: { id: note.bill_id },
            include: { project: true }
        });
        if (!bill) throw new Error("Referenced vendor bill not found.");

        // 1. Period Guard Check
        await checkPeriodGuard(companyId, note.created_at);

        // 2. Resolve accounts
        const apAccount = await resolveAccount(companyId, 'ACCOUNTS_PAYABLE');
        const expAccount = await resolveAccount(companyId, 'PROJECT_COST');
        const vatAccount = await resolveAccount(companyId, 'VAT_RECOVERABLE');

        const activePeriod = await tx.financialPeriod.findFirst({
            where: { company_id: companyId, status: "open" }
        });
        const periodId = activePeriod?.id;

        // Calculate reversal values (Debit Note represents a reduction)
        const totalAmount = Number(note.amount);
        // Assuming Standard 15% VAT rate standard reversal split
        const taxableReversal = Number((totalAmount / 1.15).toFixed(2));
        const vatReversal = Number((totalAmount - taxableReversal).toFixed(2));

        const voucher_no = await generateSequenceNo(companyId, "VOUCHER", "VCH");

        // 3. Create Balanced Reversal Voucher
        const voucher = await tx.voucher.create({
            data: {
                company_id: companyId,
                voucher_no,
                voucher_type: "JOURNAL",
                event_type: "DEBIT_NOTE_POSTED",
                posting_date: note.created_at,
                narration: `Debit Note ${note.note_no} reversing part of Vendor Bill ${bill.bill_no}`,
                total_debit: totalAmount,
                total_credit: totalAmount,
                status: "posted",
                reference_type: "DEBIT_NOTE",
                reference_id: note.id,
                created_by: userId,
                posted_by: userId,
                posted_at: new Date(),
                period_id: periodId
            }
        });

        // 4. Balanced Ledger entries
        // DR Accounts Payable (reducing outstanding supplier debt)
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: apAccount.id,
                debit: totalAmount,
                credit: 0,
                narration: `AP Reversal for Debit Note ${note.note_no}`,
                posting_date: note.created_at,
                project_id: bill.project_id
            }
        });

        // CR Expenses (reducing expense cost)
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: expAccount.id,
                debit: 0,
                credit: taxableReversal,
                narration: `Reversal Expense for Debit Note ${note.note_no}`,
                posting_date: note.created_at,
                project_id: bill.project_id
            }
        });

        // CR VAT Receivable (reducing input tax refund entitlement)
        if (vatReversal > 0) {
            await tx.ledgerEntry.create({
                data: {
                    company_id: companyId,
                    voucher_id: voucher.id,
                    account_id: vatAccount.id,
                    debit: 0,
                    credit: vatReversal,
                    narration: `Reversal VAT for Debit Note ${note.note_no}`,
                    posting_date: note.created_at,
                    project_id: bill.project_id
                }
            });
        }

        // 5. Inverted VAT Transactions input logging (negative numbers to offset inputs)
        const lines = [{
            vatType: "STANDARD",
            taxableAmount: -taxableReversal,
            vatRate: 15,
            vatAmount: -vatReversal
        }];

        await writeVATTransactions(tx, {
            companyId,
            documentType: "DEBIT_NOTE",
            documentId: note.id,
            direction: "INPUT",
            lines,
            taxConfigId: bill.tax_config_id,
            periodId,
            postingDate: note.created_at,
            userId
        });

        // 6. Update debit note status
        const updated = await tx.debitNote.update({
            where: { id: note.id },
            data: {
                status: "posted",
                voucher_id: voucher.id
            }
        });

        await logFinancialMutation({
            companyId,
            action:     "DEBIT_NOTE_POSTED",
            entityType: "DebitNote",
            entityId:   note.id,
            after:      { status: "posted", amount: totalAmount },
            meta:       { userId }
        });

        return updated;
    });
}

module.exports = {
    getDebitNotes,
    createDebitNote,
    postDebitNote
};
