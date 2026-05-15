"use strict";

const prisma = require("../../../db");
const { generateSequenceNo, checkPeriodGuard, resolveAccount } = require("../finance.utils");

const getReceipts = async (companyId, filters = {}) => {
    return await prisma.clientPaymentReceipt.findMany({
        where: {
            company_id: companyId,
            ...filters
        },
        include: {
            invoice: true,
            receiver: true,
            allocations: {
                include: { invoice: true }
            }
        },
        orderBy: { payment_date: "desc" }
    });
};

/**
 * Record a payment receipt from a client (Enterprise Multi-Invoice)
 * 1. Checks period guard
 * 2. Resolves accounts (Bank, AR)
 * 3. Creates Receipt + Multi-Allocations
 * 4. Creates Voucher + Ledger Entries
 * 5. Updates all related Invoice balances
 */
const recordReceipt = async (companyId, data, userId) => {
    return await prisma.$transaction(async (tx) => {
        const { total_amount_received, payment_date, bank_account_id, payment_mode, bank_reference, notes, allocations } = data;

        // 1. Check Period Guard
        await checkPeriodGuard(companyId, payment_date);

        // 2. Resolve Accounts
        const bankAccountAcc = await resolveAccount(companyId, 'BANK_ACCOUNT');
        const arAccount = await resolveAccount(companyId, 'ACCOUNT_RECEIVABLE');

        const receipt_no = await generateSequenceNo(companyId, "RECEIPT", "RCP");

        // 3. Create Receipt
        const receipt = await tx.clientPaymentReceipt.create({
            data: {
                company_id: companyId,
                receipt_no,
                payment_date: new Date(payment_date),
                amount_received: total_amount_received,
                bank_account_id,
                payment_mode,
                bank_reference,
                notes,
                status: "confirmed",
                received_by: userId
            }
        });

        // 4. Create Voucher
        const voucher_no = await generateSequenceNo(companyId, "VOUCHER", "VCH");
        const voucher = await tx.voucher.create({
            data: {
                company_id: companyId,
                voucher_no,
                voucher_type: "RECEIPT",
                event_type: "CLIENT_PAYMENT_RECEIVED",
                posting_date: new Date(payment_date),
                narration: notes || `Payment Receipt ${receipt_no}`,
                total_debit: total_amount_received,
                total_credit: total_amount_received,
                status: "posted",
                reference_type: "CLIENT_RECEIPT",
                reference_id: receipt.id,
                bank_account_id,
                created_by: userId,
                posted_by: userId,
                posted_at: new Date()
            }
        });

        // 5. Ledger Entries (Bank DR)
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: bankAccountAcc.id,
                debit: total_amount_received,
                credit: 0,
                narration: `Receipt ${receipt.receipt_no} from client`,
                posting_date: new Date(payment_date)
            }
        });

        // 6. Handle Allocations & AR Credits
        for (const alloc of (allocations || [])) {
            const invoice = await tx.clientInvoice.findUnique({
                where: { id: alloc.invoice_id, company_id: companyId }
            });

            if (!invoice) throw new Error(`Invoice ${alloc.invoice_id} not found.`);

            // Create Allocation record
            await tx.paymentAllocation.create({
                data: {
                    receipt_id: receipt.id,
                    invoice_id: alloc.invoice_id,
                    allocated_amount: alloc.amount,
                    created_by: userId
                }
            });

            // Ledger Entry (AR CR) per invoice/project
            await tx.ledgerEntry.create({
                data: {
                    company_id: companyId,
                    voucher_id: voucher.id,
                    account_id: arAccount.id,
                    debit: 0,
                    credit: alloc.amount,
                    narration: `Payment for Invoice ${invoice.invoice_no}`,
                    posting_date: new Date(payment_date),
                    project_id: invoice.project_id
                }
            });

            // Update Invoice balance
            const newPaidAmount = Number(invoice.amount_paid) + Number(alloc.amount);
            const newOutstanding = Number(invoice.net_payable) - newPaidAmount;
            let payment_status = "partial";
            if (newOutstanding <= 0) payment_status = "paid";

            await tx.clientInvoice.update({
                where: { id: invoice.id },
                data: {
                    amount_paid: newPaidAmount,
                    outstanding: newOutstanding,
                    payment_status
                }
            });
        }

        // Link voucher to receipt
        await tx.clientPaymentReceipt.update({
            where: { id: receipt.id },
            data: { voucher_id: voucher.id }
        });

        return receipt;
    });
};

module.exports = {
    getReceipts,
    recordReceipt
};
