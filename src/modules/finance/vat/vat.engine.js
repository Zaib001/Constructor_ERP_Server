"use strict";

/**
 * vat.engine.js — Pure VAT Calculation Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * No DB calls. Fully deterministic. SAR-standard rounding (2dp, HALF_UP).
 * Supports: STANDARD | ZERO_RATED | EXEMPT | REVERSE_CHARGE
 * Future-ready for: WITHHOLDING | COMPOUND (GCC extension)
 */

const VAT_TYPES = {
    STANDARD:       "STANDARD",
    ZERO_RATED:     "ZERO_RATED",
    EXEMPT:         "EXEMPT",
    REVERSE_CHARGE: "REVERSE_CHARGE",
};

/**
 * Round to 2 decimal places (HALF_UP — SAR standard).
 */
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Compute VAT for a single amount.
 * @param {object} p
 * @param {number}  p.amount     - The line amount (gross if inclusive, net if exclusive)
 * @param {number}  p.rate       - VAT rate percentage (e.g. 15)
 * @param {string}  p.type       - VAT_TYPES value
 * @param {boolean} p.inclusive  - Is the price VAT-inclusive?
 * @returns {{ taxableAmount, vatAmount, grossAmount, vatType, vatRate }}
 */
function computeVAT({ amount, rate, type = VAT_TYPES.STANDARD, inclusive = false }) {
    const amt = Number(amount);
    const r   = Number(rate);

    if (r < 0)   throw new Error("VAT_ENGINE: VAT rate cannot be negative.");

    // Zero-rated and Exempt: no VAT
    if (type === VAT_TYPES.ZERO_RATED || type === VAT_TYPES.EXEMPT) {
        return { taxableAmount: round2(amt), vatAmount: 0, grossAmount: round2(amt), vatType: type, vatRate: 0 };
    }

    // STANDARD and REVERSE_CHARGE: apply rate
    let taxableAmount, vatAmount, grossAmount;

    if (inclusive) {
        // Backing out VAT from gross
        taxableAmount = round2(amt / (1 + r / 100));
        vatAmount     = round2(amt - taxableAmount);
        grossAmount   = round2(amt);
    } else {
        taxableAmount = round2(amt);
        vatAmount     = round2(amt * r / 100);
        grossAmount   = round2(taxableAmount + vatAmount);
    }

    return { taxableAmount, vatAmount, grossAmount, vatType: type, vatRate: r };
}

/**
 * Compute VAT across multiple line items.
 * @param {Array}  lines      - [{ amount, rate?, type?, inclusive? }]
 * @param {object} defaults   - Default rate/type/inclusive from TaxConfiguration
 * @returns {{ lines: Array, subtotal, totalVAT, grandTotal }}
 */
function computeMultiLine(lines, defaults = {}) {
    if (!Array.isArray(lines) || lines.length === 0) {
        throw new Error("VAT_ENGINE: At least one line item is required.");
    }

    const computed = lines.map((line, idx) => {
        const amount    = Number(line.amount ?? 0);
        const rate      = Number(line.rate      ?? defaults.rate      ?? 15);
        const type      = line.type      ?? defaults.tax_type   ?? VAT_TYPES.STANDARD;
        const inclusive = line.inclusive ?? defaults.is_inclusive ?? false;

        const result = computeVAT({ amount, rate, type, inclusive });
        return { lineIndex: idx, ...line, ...result };
    });

    const subtotal   = round2(computed.reduce((s, l) => s + l.taxableAmount, 0));
    const totalVAT   = round2(computed.reduce((s, l) => s + l.vatAmount, 0));
    const grandTotal = round2(subtotal + totalVAT);

    return { lines: computed, subtotal, totalVAT, grandTotal };
}

/**
 * Validate computed totals against stored invoice values.
 * Tolerance: 0.01 SAR (rounding).
 */
function validateVATIntegrity({ subtotal, vatAmount, total }) {
    const computedTotal = round2(Number(subtotal) + Number(vatAmount));
    const diff = Math.abs(computedTotal - Number(total));
    if (diff > 0.01) {
        throw new Error(
            `VAT_ENGINE: Total mismatch. Expected ${computedTotal}, got ${total}. Diff=${diff}.`
        );
    }
    return true;
}

module.exports = { computeVAT, computeMultiLine, validateVATIntegrity, VAT_TYPES, round2 };
