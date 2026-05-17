"use strict";

const prisma = require("../../../db");
const { generateSequenceNo, checkPeriodGuard, resolveAccount } = require("../finance.utils");
const { requestApproval } = require("../../approvals/approvals.service");
const { registerAdapter } = require("../../approvals/approvals.adapter");
const { computeInvoiceVAT, writeVATTransactions } = require("../vat/vat.service");
const { enqueueInvoiceSubmission, processSubmission } = require("../zatca/zatca.service");
const logger = require("../../../logger");

// 1. Register Approval Adapter for Client Invoices
registerAdapter("CLIENT_INVOICE", async ({ docId, status, userId, companyId }) => {
    // When approval is complete, we update the status
    // If status is 'approved', we don't automatically post, 
    // but the user can now trigger 'postInvoice' which will check for 'approved' status.
    await prisma.clientInvoice.update({
        where: { id: docId, company_id: companyId },
        data: { document_status: status }
    });
});

const getInvoices = async (companyId, filters = {}) => {
    return await prisma.clientInvoice.findMany({
        where: {
            company_id: companyId,
            ...filters
        },
        include: {
            project: true,
            creator: true,
            items: true,
            zatca_submissions: {
                orderBy: { submitted_at: "desc" },
                take: 1
            }
        },
        orderBy: { invoice_date: "desc" }
    });
};

const createInvoice = async (companyId, data, userId) => {
    // 1. Check Period Guard (Drafts might not need it, but it's safer for creation)
    await checkPeriodGuard(companyId, data.invoice_date);

    const invoice_no = await generateSequenceNo(companyId, "INVOICE", "INV");
    const { items, ...invoiceData } = data;

    // 2. Deterministic VAT Calculation
    const vatResult = await computeInvoiceVAT(companyId, {
        items,
        tax_config_id: data.tax_config_id,
        is_vat_inclusive: data.is_vat_inclusive
    });

    // Enrich items with calculated values
    const enrichedItems = items.map((item, idx) => {
        const calculatedLine = vatResult.lines[idx];
        return {
            ...item,
            taxable_amount: calculatedLine.taxableAmount,
            vat_amount:     calculatedLine.vatAmount,
            total_amount:   calculatedLine.grossAmount
        };
    });

    const invoice = await prisma.clientInvoice.create({
        data: {
            ...invoiceData,
            company_id:      companyId,
            invoice_no,
            created_by:      userId,
            document_status: "draft", // Starts as draft
            subtotal:        vatResult.subtotal,
            vat_amount:      vatResult.vat_amount,
            net_payable:     vatResult.total_amount,
            items: {
                create: enrichedItems
            }
        }
    });

    // 3. Trigger Approval Workflow (Enterprise Rule: Invoices > 0 require approval)
    if (Number(invoice.net_payable) > 0) {
        await requestApproval({
            docType: "CLIENT_INVOICE",
            docId: invoice.id,
            projectId: invoice.project_id,
            amount: invoice.net_payable,
            companyId: companyId
        }, userId);
    }

    return invoice;
};

/**
 * Post an invoice to the ledger
 * Enterprise Requirement: Must be approved and period must be open.
 */
const postInvoice = async (id, companyId, userId) => {
    const updatedInvoice = await prisma.$transaction(async (tx) => {
        const invoice = await tx.clientInvoice.findUnique({
            where: { id, company_id: companyId },
            include: { project: true, items: true }
        });

        if (!invoice) throw new Error("Invoice not found.");
        if (invoice.document_status !== "approved") throw new Error("Invoice must be fully approved before posting.");
        if (invoice.posting_status === "posted") throw new Error("Invoice is already posted.");

        // 1. Check Period Guard
        await checkPeriodGuard(companyId, invoice.invoice_date);

        // 2. Resolve Dynamic Accounts
        const arAccount = await resolveAccount(companyId, 'ACCOUNT_RECEIVABLE');
        const revAccount = await resolveAccount(companyId, 'REVENUE_ACCOUNT');
        const vatAccount = await resolveAccount(companyId, 'VAT_PAYABLE');

        // 3. Create Voucher
        const voucher_no = await generateSequenceNo(companyId, "VOUCHER", "VCH");
        const activePeriod = await tx.financialPeriod.findFirst({
            where: { company_id: companyId, status: "open" }
        });
        const periodId = activePeriod?.id;

        const voucher = await tx.voucher.create({
            data: {
                company_id: companyId,
                voucher_no,
                voucher_type: "RECEIPT",
                event_type: "CLIENT_INVOICE_POSTED",
                posting_date: invoice.invoice_date,
                narration: `Invoice ${invoice.invoice_no} for Project ${invoice.project?.name}`,
                total_debit: invoice.net_payable,
                total_credit: invoice.net_payable,
                status: "posted",
                reference_type: "CLIENT_INVOICE",
                reference_id: invoice.id,
                created_by: userId,
                posted_by: userId,
                posted_at: new Date(),
                period_id: periodId
            }
        });

        // 4. Ledger Entries
        // DR AR
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: arAccount.id,
                debit: invoice.net_payable,
                credit: 0,
                narration: `AR for Invoice ${invoice.invoice_no}`,
                posting_date: invoice.invoice_date,
                project_id: invoice.project_id
            }
        });

        // CR Revenue
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: revAccount.id,
                debit: 0,
                credit: invoice.subtotal,
                narration: `Revenue for Invoice ${invoice.invoice_no}`,
                posting_date: invoice.invoice_date,
                project_id: invoice.project_id
            }
        });

        // CR VAT
        if (Number(invoice.vat_amount) > 0) {
            await tx.ledgerEntry.create({
                data: {
                    company_id: companyId,
                    voucher_id: voucher.id,
                    account_id: vatAccount.id,
                    debit: 0,
                    credit: invoice.vat_amount,
                    narration: `VAT for Invoice ${invoice.invoice_no}`,
                    posting_date: invoice.invoice_date,
                    project_id: invoice.project_id
                }
            });
        }

        // 5. Write Immutable VAT Transactions
        const computedLines = invoice.items.map(item => ({
            taxableAmount: Number(item.taxable_amount || item.subtotal),
            vatAmount:     Number(item.vat_amount || 0),
            vatRate:       15, // GCC standard
            vatType:       "STANDARD"
        }));

        await writeVATTransactions(tx, {
            companyId,
            documentType: "CLIENT_INVOICE",
            documentId: invoice.id,
            direction: "OUTPUT",
            lines: computedLines,
            taxConfigId: invoice.tax_config_id,
            periodId,
            postingDate: invoice.invoice_date,
            userId
        });

        // 6. Update Invoice Status to Posted
        return await tx.clientInvoice.update({
            where: { id },
            data: {
                posting_status: "posted",
                voucher_id: voucher.id
            }
        });
    });

    // 7. Enqueue to ZATCA Asynchronously (Non-blocking gateway)
    enqueueInvoiceSubmission(updatedInvoice.id, companyId, userId)
        .then(sub => {
            logger.info(`[ZATCA Integration] Enqueued submission ${sub.id} for invoice ${updatedInvoice.invoice_no}`);
            processSubmission(sub.id).catch(err => {
                logger.error(`[ZATCA Integration] Automated async processing failed: ${err.message}`);
            });
        })
        .catch(err => {
            logger.error(`[ZATCA Integration] Automated enqueuing failed: ${err.message}`);
        });

    return updatedInvoice;
};

module.exports = {
    getInvoices,
    createInvoice,
    postInvoice
};
