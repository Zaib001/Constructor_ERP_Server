"use strict";

/**
 * Subcontractor Management System Utilities
 * Centralized logic for financial calculations, validations, and numbering.
 */

const subcontractUtils = {
    // ─── Financial Calculations ──────────────────────────────────────────────

    /**
     * Calculates RA Bill financial abstract.
     */
    calculateNetPayable: ({ grossAmount, retentionPct, taxPct, taxMode = "withholding", advanceRecovery = 0, deductions = 0 }) => {
        const retentionAmount = (Number(grossAmount) * Number(retentionPct)) / 100;
        const taxAmount = (Number(grossAmount) * Number(taxPct)) / 100;
        
        let netPayable;
        if (taxMode === "additive") {
            // VAT style: Gross + Tax - Retention - Advance - Deductions
            netPayable = Number(grossAmount) + taxAmount - retentionAmount - Number(advanceRecovery) - Number(deductions);
        } else {
            // Withholding style: Gross - Tax - Retention - Advance - Deductions
            netPayable = Number(grossAmount) - taxAmount - retentionAmount - Number(advanceRecovery) - Number(deductions);
        }
        
        return {
            grossAmount: Number(grossAmount),
            retentionAmount,
            taxAmount,
            netPayable: Math.max(0, netPayable) // Prevent negative payables
        };
    },

    // ─── Limit Validations ───────────────────────────────────────────────────

    /**
     * Validates if the new measurement exceeds contracted quantity.
     */
    validateMeasurementLimits: (contractedQty, cumulativeBefore, currentQty) => {
        const cumulativeAfter = Number(cumulativeBefore) + Number(currentQty);
        if (cumulativeAfter > Number(contractedQty) + 0.001) { // 0.001 tolerance for floating point
            throw new Error(`Cumulative quantity (${cumulativeAfter.toFixed(3)}) exceeds contracted quantity (${Number(contractedQty).toFixed(3)})`);
        }
        return true;
    },

    /**
     * Validates if the payment exceeds RA Bill net payable.
     */
    validatePaymentLimits: (netPayable, totalPaidBefore, currentPayment) => {
        const totalPaidAfter = Number(totalPaidBefore) + Number(currentPayment);
        if (totalPaidAfter > Number(netPayable) + 0.01) {
            throw new Error(`Total payment (${totalPaidAfter.toFixed(2)}) exceeds RA Bill net payable (${Number(netPayable).toFixed(2)})`);
        }
        return true;
    },

    // ─── Numbering Utilities ─────────────────────────────────────────────────

    /**
     * Generates a standard document number.
     * MSR: Measurement (MSR-YYYYMMDD-XXXX)
     * RAB: RA Bill (RAB-YYYYMMDD-XXXX)
     * SWO: Work Order (SWO-YYYYMMDD-XXXX)
     */
    generateDocNo: (prefix, count) => {
        const today = new Date();
        const datePart = today.toISOString().slice(0, 10).replace(/-/g, "");
        const sequence = String(count + 1).padStart(4, "0");
        return `${prefix}-${datePart}-${sequence}`;
    }
};

module.exports = subcontractUtils;
