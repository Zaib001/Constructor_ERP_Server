"use strict";

/**
 * vat.reconciliation.js — VAT Reconciliation & Mismatch Detector
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-references VATTransaction records with General Ledger balances to identify
 * discrepancies. Periodically writes a VATReconciliationSnapshot for audit readiness.
 */

const prisma = require("../../../db");
const { getVATSummary } = require("./vat.service");
const { resolveAccount, checkPeriodGuard } = require("../finance.utils");
const { round2 } = require("./vat.engine");

/**
 * Reconcile period VATTransactions against General Ledger Account balances.
 */
async function reconcilePeriodVAT(companyId, periodId, userId) {
    const period = await prisma.financialPeriod.findFirst({
        where: { id: periodId, company_id: companyId }
    });
    if (!period) throw new Error("Financial period not found.");

    // 1. Period Guard Check
    await checkPeriodGuard(companyId, period.start_date);

    // 2. Sum up VAT transactions (VATTransaction table)
    const txSummary = await getVATSummary(companyId, periodId);

    // 3. Fetch General Ledger account balances for VAT Output (Sales) and VAT Input (Purchases)
    let outputLedger = 0;
    let inputLedger = 0;

    try {
        const outputAccount = await resolveAccount(companyId, "VAT_PAYABLE");
        const outAggregate = await prisma.ledgerEntry.aggregate({
            where: {
                company_id: companyId,
                period_id:  periodId,
                account_id: outputAccount.id
            },
            _sum: { debit: true, credit: true }
        });
        // VAT output has credit balance: CR - DR
        outputLedger = round2(Number(outAggregate._sum.credit || 0) - Number(outAggregate._sum.debit || 0));
    } catch (e) {
        // Log & proceed if account setting not configured yet
    }

    try {
        const inputAccount = await resolveAccount(companyId, "VAT_RECOVERABLE");
        const inAggregate = await prisma.ledgerEntry.aggregate({
            where: {
                company_id: companyId,
                period_id:  periodId,
                account_id: inputAccount.id
            },
            _sum: { debit: true, credit: true }
        });
        // VAT input has debit balance: DR - CR
        inputLedger = round2(Number(inAggregate._sum.debit || 0) - Number(inAggregate._sum.credit || 0));
    } catch (e) {
        // Proceed
    }

    const outputMismatch = round2(Math.abs(outputLedger - txSummary.outputVAT));
    const inputMismatch  = round2(Math.abs(inputLedger - txSummary.inputVAT));
    const isBalanced     = outputMismatch <= 0.01 && inputMismatch <= 0.01;

    // 3. Persist VAT reconciliation snapshot
    const snapshot = await prisma.vATReconciliationSnapshot.create({
        data: {
            company_id:        companyId,
            period_id:         periodId,
            period_month:      period.period_name,
            output_vat_ledger: outputLedger,
            output_vat_tx:     txSummary.outputVAT,
            input_vat_ledger:  inputLedger,
            input_vat_tx:      txSummary.inputVAT,
            output_mismatch:   outputMismatch,
            input_mismatch:    inputMismatch,
            is_balanced:       isBalanced,
            computed_by:       userId
        }
    });

    return snapshot;
}

/**
 * Detect line-level VAT mismatches where calculated invoice VAT does not match transaction logs.
 */
async function detectLineVATMismatches(companyId, periodId) {
    const invoices = await prisma.clientInvoice.findMany({
        where: {
            company_id: companyId,
            posting_status: "posted"
        },
        include: {
            vat_transactions: true
        }
    });

    const mismatches = [];

    invoices.forEach(inv => {
        const txTotal = inv.vat_transactions.reduce((sum, tx) => sum + Number(tx.vat_amount), 0);
        const invTotal = Number(inv.vat_amount);
        const diff = round2(Math.abs(invTotal - txTotal));

        if (diff > 0.01) {
            mismatches.push({
                documentId:   inv.id,
                documentNo:   inv.invoice_no,
                documentType: "CLIENT_INVOICE",
                invoiceVAT:   invTotal,
                calculatedTX: txTotal,
                difference:   diff
            });
        }
    });

    return mismatches;
}

module.exports = { reconcilePeriodVAT, detectLineVATMismatches };
