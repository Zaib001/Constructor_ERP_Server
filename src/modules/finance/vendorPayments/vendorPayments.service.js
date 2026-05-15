"use strict";

const prisma = require("../../../db");
const { generateSequenceNo, checkPeriodGuard, resolveAccount } = require("../finance.utils");

const getPayments = async (companyId, filters = {}) => {
    return await prisma.vendorPayment.findMany({
        where: {
            company_id: companyId,
            ...filters
        },
        include: {
            bill: true,
            processor: true,
            allocations: {
                include: { bill: true }
            }
        },
        orderBy: { payment_date: "desc" }
    });
};

/**
 * Record a payment to a vendor (Enterprise Multi-Bill)
 * 1. Checks period guard
 * 2. Resolves accounts (Bank, AP)
 * 3. Creates Payment + Multi-Allocations
 * 4. Creates Voucher + Ledger Entries
 */
const recordPayment = async (companyId, data, userId) => {
    return await prisma.$transaction(async (tx) => {
        const { total_amount_paid, payment_date, bank_account_id, payment_mode, bank_reference, notes, allocations } = data;

        // 1. Check Period Guard
        await checkPeriodGuard(companyId, payment_date);

        // 2. Resolve Accounts
        const apAccount = await resolveAccount(companyId, 'ACCOUNTS_PAYABLE');
        const bankAccountAcc = await resolveAccount(companyId, 'BANK_ACCOUNT');

        const payment_no = await generateSequenceNo(companyId, "VENDOR_PAYMENT", "VPM");

        // 3. Create Payment
        const payment = await tx.vendorPayment.create({
            data: {
                company_id: companyId,
                payment_no,
                payment_date: new Date(payment_date),
                amount_paid: total_amount_paid,
                bank_account_id,
                payment_mode,
                bank_reference,
                notes,
                status: "processed",
                processed_by: userId
            }
        });

        // 4. Create Voucher
        const voucher_no = await generateSequenceNo(companyId, "VOUCHER", "VCH");
        const voucher = await tx.voucher.create({
            data: {
                company_id: companyId,
                voucher_no,
                voucher_type: "PAYMENT",
                event_type: "VENDOR_PAYMENT_PROCESSED",
                posting_date: new Date(payment_date),
                narration: notes || `Vendor Payment ${payment_no}`,
                total_debit: total_amount_paid,
                total_credit: total_amount_paid,
                status: "posted",
                reference_type: "VENDOR_PAYMENT",
                reference_id: payment.id,
                bank_account_id,
                created_by: userId,
                posted_by: userId,
                posted_at: new Date()
            }
        });

        // 5. Ledger Entries (Bank CR)
        await tx.ledgerEntry.create({
            data: {
                company_id: companyId,
                voucher_id: voucher.id,
                account_id: bankAccountAcc.id,
                debit: 0,
                credit: total_amount_paid,
                narration: `Payment ${payment.payment_no} to vendor`,
                posting_date: new Date(payment_date)
            }
        });

        // 6. Handle Allocations & AP Debits
        for (const alloc of (allocations || [])) {
            const bill = await tx.vendorBill.findUnique({
                where: { id: alloc.bill_id, company_id: companyId }
            });

            if (!bill) throw new Error(`Vendor bill ${alloc.bill_id} not found.`);

            // Create Allocation record
            await tx.vendorPaymentAllocation.create({
                data: {
                    payment_id: payment.id,
                    bill_id: alloc.bill_id,
                    allocated_amount: alloc.amount,
                    created_by: userId
                }
            });

            // Ledger Entry (AP DR) per bill/project
            await tx.ledgerEntry.create({
                data: {
                    company_id: companyId,
                    voucher_id: voucher.id,
                    account_id: apAccount.id,
                    debit: alloc.amount,
                    credit: 0,
                    narration: `Payment for Bill ${bill.bill_no}`,
                    posting_date: new Date(payment_date),
                    project_id: bill.project_id
                }
            });

            // Update Bill balance
            const newPaidAmount = Number(bill.amount_paid) + Number(alloc.amount);
            const newOutstanding = Number(bill.net_payable) - newPaidAmount;
            let payment_status = "partial";
            if (newOutstanding <= 0) payment_status = "paid";

            await tx.vendorBill.update({
                where: { id: bill.id },
                data: {
                    amount_paid: newPaidAmount,
                    outstanding: newOutstanding,
                    payment_status
                }
            });
        }

        // Link voucher to payment
        await tx.vendorPayment.update({
            where: { id: payment.id },
            data: { voucher_id: voucher.id }
        });

        return payment;
    });
};

module.exports = {
    getPayments,
    recordPayment
};
