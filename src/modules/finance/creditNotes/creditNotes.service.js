"use strict";

const prisma = require("../../../db");
const logger = require("../../../logger");
const { generateSequenceNo, checkPeriodGuard, resolveAccount } = require("../finance.utils");
const { writeVATTransactions } = require("../vat/vat.service");
const { logFinancialMutation } = require("../audit/financial.audit");
const { enqueueCreditNoteSubmission } = require("../zatca/zatca.service");

/**
 * Get all credit notes
 */
async function getCreditNotes(companyId) {
    return prisma.creditNote.findMany({
        where: { company_id: companyId },
        include: {
            creator: { select: { name: true, email: true } }
        },
        orderBy: { created_at: "desc" }
    });
}

/**
 * Create a new draft Credit Note
 */
async function createCreditNote(companyId, { invoiceId, amount, reason }, userId) {
    const invoice = await prisma.clientInvoice.findFirst({
        where: { id: invoiceId, company_id: companyId }
    });

    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.posting_status !== "posted") {
        throw new Error("Can only issue Credit Notes against posted invoices.");
    }

    const note_no = await generateSequenceNo(companyId, "CREDIT_NOTE", "CN");

    const note = await prisma.creditNote.create({
        data: {
            company_id: companyId,
            invoice_id: invoiceId,
            note_no,
            amount:     amount,
            reason:     reason || "Customer sales return",
            status:     "draft",
            created_by: userId
        }
    });

    return note;
}

/**
 * Post a Credit Note
 * Performs balanced ledger postings (DR Revenue, DR VAT Payable, CR Accounts Receivable)
 * and writes inverted output VAT transactions
 */
async function postCreditNote(id, companyId, userId) {
    const updated = await prisma.$transaction(async (tx) => {
        const note = await tx.creditNote.findFirst({
            where: { id, company_id: companyId }
        });

        if (!note) throw new Error("Credit Note not found.");
        if (note.status === "posted") throw new Error("Credit Note is already posted.");

        const invoice = await tx.clientInvoice.findUnique({
            where: { id: note.invoice_id },
            include: { project: true }
        });
        if (!invoice) throw new Error("Referenced invoice not found.");

        // 1. Period Guard Check
        await checkPeriodGuard(companyId, note.created_at);

        // 2. Resolve accounts
        const arAccount = await resolveAccount(companyId, 'ACCOUNT_RECEIVABLE');
        const revAccount = await resolveAccount(companyId, 'REVENUE_ACCOUNT');
        const vatAccount = await resolveAccount(companyId, 'VAT_PAYABLE');

        const activePeriod = await tx.financialPeriod.findFirst({
            where: { company_id: companyId, status: "open" }
        });
        const periodId = activePeriod?.id;

        // Calculate reversal values (Credit Note represents a reduction)
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
                event_type: "CREDIT_NOTE_POSTED",
                posting_date: note.created_at,
                narration: `Credit Note ${note.note_no} reversing part of Invoice ${invoice.invoice_no}`,
                total_debit: totalAmount,
                total_credit: totalAmount,
                status: "posted",
                reference_type: "CREDIT_NOTE",
                reference_id: note.id,
                created_by: userId,
                posted_by: userId,
                posted_at: new Date(),
                period_id: periodId
            }
        });

        // 4. Balanced Ledger entries
        // DR Revenue (reduction in sales)
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: revAccount.id,
                debit: taxableReversal,
                credit: 0,
                narration: `Reversal Revenue for Credit Note ${note.note_no}`,
                posting_date: note.created_at,
                project_id: invoice.project_id
            }
        });

        // DR VAT Payable (reduction in output tax due)
        if (vatReversal > 0) {
            await tx.ledgerEntry.create({
                data: {
                    company_id: companyId,
                    voucher_id: voucher.id,
                    account_id: vatAccount.id,
                    debit: vatReversal,
                    credit: 0,
                    narration: `Reversal VAT for Credit Note ${note.note_no}`,
                    posting_date: note.created_at,
                    project_id: invoice.project_id
                }
            });
        }

        // CR Accounts Receivable (reducing client outstanding liability)
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: arAccount.id,
                debit: 0,
                credit: totalAmount,
                narration: `AR Reversal for Credit Note ${note.note_no}`,
                posting_date: note.created_at,
                project_id: invoice.project_id
            }
        });

        // 5. Inverted VAT Transactions output logging (negative numbers to offset sales)
        const lines = [{
            vatType: "STANDARD",
            taxableAmount: -taxableReversal,
            vatRate: 15,
            vatAmount: -vatReversal
        }];

        await writeVATTransactions(tx, {
            companyId,
            documentType: "CREDIT_NOTE",
            documentId: note.id,
            direction: "OUTPUT",
            lines,
            taxConfigId: invoice.tax_config_id,
            periodId,
            postingDate: note.created_at,
            userId
        });

        // 6. Update credit note status
        const updated = await tx.creditNote.update({
            where: { id: note.id },
            data: {
                status: "posted",
                voucher_id: voucher.id
            }
        });

        await logFinancialMutation({
            companyId,
            action:     "CREDIT_NOTE_POSTED",
            entityType: "CreditNote",
            entityId:   note.id,
            after:      { status: "posted", amount: totalAmount },
            meta:       { userId }
        });

        return updated;
    });

    enqueueCreditNoteSubmission(updated.id, companyId, userId).catch(err => {
        logger.error(`[Credit Note Post] Async ZATCA enqueue failed for Credit Note ${updated.id}:`, err.message);
    });

    return updated;
}

module.exports = {
    getCreditNotes,
    createCreditNote,
    postCreditNote
};
