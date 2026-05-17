"use strict";

/**
 * vat.service.js — VAT DB Integration Layer
 * Reads TaxConfiguration, writes VATTransaction records (immutable).
 * Called by invoices.service and vendorBills.service.
 */

const prisma  = require("../../../db");
const { computeMultiLine, validateVATIntegrity } = require("./vat.engine");

/**
 * Get active tax config for a company.
 */
const getTaxConfigs = async (companyId) =>
    prisma.taxConfiguration.findMany({
        where: { company_id: companyId },
        orderBy: { effective_from: "desc" }
    });

const getTaxConfigById = async (id, companyId) =>
    prisma.taxConfiguration.findFirst({ where: { id, company_id: companyId } });

const createTaxConfig = async (companyId, data) =>
    prisma.taxConfiguration.create({ data: { ...data, company_id: companyId } });

const updateTaxConfig = async (id, companyId, data) =>
    prisma.taxConfiguration.update({ where: { id, company_id: companyId }, data });

/**
 * Compute and validate VAT for an invoice/bill being created.
 * Returns enriched data with vat_amount, subtotal, total_amount.
 */
const computeInvoiceVAT = async (companyId, { items, tax_config_id, is_vat_inclusive }) => {
    let taxConfig = null;
    if (tax_config_id) {
        taxConfig = await getTaxConfigById(tax_config_id, companyId);
    }

    const result = computeMultiLine(items, taxConfig || {});
    return {
        subtotal:     result.subtotal,
        vat_amount:   result.totalVAT,
        total_amount: result.grandTotal,
        lines:        result.lines,
        vat_type:     taxConfig?.tax_type    || "STANDARD",
        is_vat_inclusive: is_vat_inclusive ?? taxConfig?.is_inclusive ?? false,
    };
};

/**
 * Write immutable VATTransaction records after posting.
 * Called inside prisma.$transaction.
 */
const writeVATTransactions = async (tx, {
    companyId, documentType, documentId, direction,
    lines, taxConfigId, periodId, postingDate, userId
}) => {
    const records = lines.map((line, idx) => ({
        company_id:     companyId,
        document_type:  documentType,
        document_id:    documentId,
        vat_type:       line.vatType,
        direction,
        line_index:     idx,
        taxable_amount: line.taxableAmount,
        vat_rate:       line.vatRate,
        vat_amount:     line.vatAmount,
        tax_config_id:  taxConfigId || null,
        period_id:      periodId    || null,
        posting_date:   new Date(postingDate),
        created_by:     userId,
    }));

    await tx.vATTransaction.createMany({ data: records });
};

/**
 * VAT Summary for a company (for dashboard and filing).
 */
const getVATSummary = async (companyId, periodId) => {
    const where = { company_id: companyId, ...(periodId ? { period_id: periodId } : {}) };

    const [output, input] = await Promise.all([
        prisma.vATTransaction.aggregate({ where: { ...where, direction: "OUTPUT" }, _sum: { vat_amount: true, taxable_amount: true } }),
        prisma.vATTransaction.aggregate({ where: { ...where, direction: "INPUT"  }, _sum: { vat_amount: true, taxable_amount: true } }),
    ]);

    const outputVAT = Number(output._sum.vat_amount || 0);
    const inputVAT  = Number(input._sum.vat_amount  || 0);
    return {
        outputVAT,
        inputVAT,
        netVATPayable: outputVAT - inputVAT,
        outputTaxable: Number(output._sum.taxable_amount || 0),
        inputTaxable:  Number(input._sum.taxable_amount  || 0),
    };
};

/**
 * Paginated VAT transaction ledger.
 */
const getVATTransactions = async (companyId, { direction, periodId, page = 1, limit = 50 } = {}) => {
    const skip = (page - 1) * limit;
    const where = {
        company_id: companyId,
        ...(direction ? { direction } : {}),
        ...(periodId  ? { period_id: periodId } : {}),
    };

    const [data, total] = await Promise.all([
        prisma.vATTransaction.findMany({ where, skip, take: limit, orderBy: { posting_date: "desc" } }),
        prisma.vATTransaction.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
};

/**
 * VAT Filing data for a given period.
 */
const getVATFiling = async (companyId, periodId) => {
    const period = await prisma.financialPeriod.findFirst({ where: { id: periodId, company_id: companyId } });
    if (!period) throw new Error("Financial period not found.");

    const summary = await getVATSummary(companyId, periodId);

    const transactions = await prisma.vATTransaction.findMany({
        where: { company_id: companyId, period_id: periodId },
        orderBy: { posting_date: "asc" },
    });

    return { period, summary, transactions };
};

/**
 * Records an audit-safe manual VAT adjustment in a period
 */
const recordVATAdjustment = async (companyId, { periodId, amount, reason, adjustmentType }, userId) => {
    // Confirm the period isn't already closed/locked
    const period = await prisma.financialPeriod.findFirst({ where: { id: periodId, company_id: companyId } });
    if (!period) throw new Error("Financial period not found.");
    if (period.status === "locked") throw new Error("Cannot add adjustments to a locked financial period.");

    const adjustment = await prisma.vATAdjustment.create({
        data: {
            company_id:      companyId,
            period_id:       periodId,
            amount:          amount,
            reason:          reason,
            adjustment_type: adjustmentType,
            created_by:      userId
        }
    });

    const { logFinancialMutation } = require("../audit/financial.audit");
    await logFinancialMutation({
        companyId,
        action:     "VAT_ADJUSTMENT_CREATED",
        entityType: "VATAdjustment",
        entityId:   adjustment.id,
        after:      { amount, reason, adjustmentType },
        meta:       { userId }
    });

    return adjustment;
};

/**
 * Returns adjustments for a given period
 */
const getVATAdjustments = async (companyId, periodId) =>
    prisma.vATAdjustment.findMany({
        where: { company_id: companyId, period_id: periodId },
        orderBy: { created_at: "desc" }
    });

/**
 * Calculates prior period carry-forward credit.
 * Looks back at the most recent closed VATFiling.
 * If total_vat_due was negative (a refund due), that credit is carried forward.
 */
const getPriorPeriodCarryForward = async (companyId, currentPeriodId) => {
    const currentPeriod = await prisma.financialPeriod.findFirst({ where: { id: currentPeriodId, company_id: companyId } });
    if (!currentPeriod) return 0;

    // Find the immediately prior financial period (start date before current)
    const priorPeriod = await prisma.financialPeriod.findFirst({
        where: {
            company_id: companyId,
            start_date: { lt: currentPeriod.start_date }
        },
        orderBy: { start_date: "desc" }
    });

    if (!priorPeriod) return 0;

    // Check if there is a filed VAT Return for the prior period
    const priorFiling = await prisma.vATFiling.findFirst({
        where: { company_id: companyId, period_id: priorPeriod.id, status: "closed" }
    });

    if (priorFiling && Number(priorFiling.total_vat_due) < 0) {
        return Math.abs(Number(priorFiling.total_vat_due));
    }

    return 0;
};

/**
 * Generates a complete, structured VAT return summary including sales, purchases, exempt, zero-rated, adjustments, and carry-forwards.
 */
const getVATReturnSummary = async (companyId, periodId) => {
    const period = await prisma.financialPeriod.findFirst({ where: { id: periodId, company_id: companyId } });
    if (!period) throw new Error("Financial period not found.");

    // Standard Sales Outputs
    const salesStandard = await prisma.vATTransaction.aggregate({
        where: { company_id: companyId, period_id: periodId, direction: "OUTPUT", vat_type: "STANDARD" },
        _sum: { taxable_amount: true, vat_amount: true }
    });

    // Zero-Rated Sales
    const salesZeroRated = await prisma.vATTransaction.aggregate({
        where: { company_id: companyId, period_id: periodId, direction: "OUTPUT", vat_type: "ZERO_RATED" },
        _sum: { taxable_amount: true }
    });

    // Exempt Sales
    const salesExempt = await prisma.vATTransaction.aggregate({
        where: { company_id: companyId, period_id: periodId, direction: "OUTPUT", vat_type: "EXEMPT" },
        _sum: { taxable_amount: true }
    });

    // Standard Purchases Inputs
    const purchasesStandard = await prisma.vATTransaction.aggregate({
        where: { company_id: companyId, period_id: periodId, direction: "INPUT", vat_type: "STANDARD" },
        _sum: { taxable_amount: true, vat_amount: true }
    });

    // Reverse Charges Inputs
    const reverseCharges = await prisma.vATTransaction.aggregate({
        where: { company_id: companyId, period_id: periodId, direction: "INPUT", vat_type: "REVERSE_CHARGE" },
        _sum: { taxable_amount: true, vat_amount: true }
    });

    // Adjustments sum
    const adjustmentsList = await getVATAdjustments(companyId, periodId);
    const adjustmentsSum = adjustmentsList.reduce((sum, adj) => sum + Number(adj.amount), 0);

    // Carry forward
    const carryForward = await getPriorPeriodCarryForward(companyId, periodId);

    const outVAT = Number(salesStandard._sum.vat_amount || 0);
    const inVAT = Number(purchasesStandard._sum.vat_amount || 0) + Number(reverseCharges._sum.vat_amount || 0);
    const netVATAmt = outVAT - inVAT;
    const finalVATDue = netVATAmt + adjustmentsSum - carryForward;

    return {
        period,
        sales_standard_taxable:   Number(salesStandard._sum.taxable_amount || 0),
        sales_standard_vat:       outVAT,
        sales_zero_rated:         Number(salesZeroRated._sum.taxable_amount || 0),
        sales_exempt:             Number(salesExempt._sum.taxable_amount || 0),
        purchases_standard_taxable: Number(purchasesStandard._sum.taxable_amount || 0),
        purchases_standard_vat:   Number(purchasesStandard._sum.vat_amount || 0),
        reverse_charges:          Number(reverseCharges._sum.vat_amount || 0),
        net_vat_amount:           netVATAmt,
        adjustment_amount:        adjustmentsSum,
        carry_forward_applied:    carryForward,
        total_vat_due:            finalVATDue,
        adjustments:              adjustmentsList
    };
};

/**
 * Freezes and locks a VAT filing period.
 * Saves the filing record and marks the FinancialPeriod status as locked.
 */
const closeVATPeriod = async (companyId, periodId, userId) => {
    const summary = await getVATReturnSummary(companyId, periodId);

    // Persist locked VAT Return snapshot
    const filing = await prisma.vATFiling.upsert({
        where: { company_id_period_id: { company_id: companyId, period_id: periodId } },
        update: {
            status:                     "closed",
            sales_standard_taxable:     summary.sales_standard_taxable,
            sales_standard_vat:         summary.sales_standard_vat,
            sales_zero_rated:           summary.sales_zero_rated,
            sales_exempt:               summary.sales_exempt,
            purchases_standard_taxable:   summary.purchases_standard_taxable,
            purchases_standard_vat:     summary.purchases_standard_vat,
            reverse_charges:            summary.reverse_charges,
            net_vat_amount:             summary.net_vat_amount,
            adjustment_amount:          summary.adjustment_amount,
            carry_forward_applied:      summary.carry_forward_applied,
            total_vat_due:              summary.total_vat_due,
            filed_at:                   new Date(),
            filed_by:                   userId
        },
        create: {
            company_id:                 companyId,
            period_id:                  periodId,
            status:                     "closed",
            sales_standard_taxable:     summary.sales_standard_taxable,
            sales_standard_vat:         summary.sales_standard_vat,
            sales_zero_rated:           summary.sales_zero_rated,
            sales_exempt:               summary.sales_exempt,
            purchases_standard_taxable:   summary.purchases_standard_taxable,
            purchases_standard_vat:     summary.purchases_standard_vat,
            reverse_charges:            summary.reverse_charges,
            net_vat_amount:             summary.net_vat_amount,
            adjustment_amount:          summary.adjustment_amount,
            carry_forward_applied:      summary.carry_forward_applied,
            total_vat_due:              summary.total_vat_due,
            filed_at:                   new Date(),
            filed_by:                   userId
        }
    });

    // Mark financial period as strictly locked
    const { updatePeriodStatus } = require("../periods/periods.service");
    await updatePeriodStatus(periodId, companyId, "locked", userId);

    return filing;
};

/**
 * Retrieves all closed filing snapshots for the company
 */
const getVATFilingsHistory = async (companyId) => {
    return prisma.vATFiling.findMany({
        where: { company_id: companyId },
        include: { period: true },
        orderBy: { filed_at: "desc" }
    });
};

module.exports = {
    getTaxConfigs, getTaxConfigById, createTaxConfig, updateTaxConfig,
    computeInvoiceVAT, writeVATTransactions,
    getVATSummary, getVATTransactions, getVATFiling,
    recordVATAdjustment, getVATAdjustments, getVATReturnSummary, closeVATPeriod,
    getVATFilingsHistory
};
