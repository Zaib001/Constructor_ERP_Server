"use strict";

/**
 * profitability.calculator.js — Pure Financial Profitability Calculations
 * ─────────────────────────────────────────────────────────────────────────────
 * Performs all arithmetic calculations of project margins, department cost rollups,
 * and company EBIT/EBITDA. Fully deterministic and isolated from database operations.
 */

const { round2 } = require("../vat/vat.engine");

/**
 * Calculate Project Profitability Margin.
 */
function computeProjectProfitability({
    contractValue = 0,
    revenue = 0,
    directCosts = 0,
    laborCosts = 0,
    materialCosts = 0,
    subcontractorCosts = 0,
    overheadAllocation = 0
}) {
    const rev   = Number(revenue);
    const dir   = Number(directCosts);
    const labor = Number(laborCosts);
    const mat   = Number(materialCosts);
    const sub   = Number(subcontractorCosts);
    const over  = Number(overheadAllocation);
    const contract = Number(contractValue);

    // Total cost = sum of all direct & allocated indirect costs
    const totalCost = round2(dir + labor + mat + sub + over);
    const grossProfit = round2(rev - (dir + labor + mat + sub));
    const netProfit = round2(rev - totalCost);
    
    const profitMarginPct = rev > 0 ? round2((netProfit / rev) * 100) : 0;

    // Forecast margins (budget vs actual estimations)
    // Projected revenue is based on contract value, projected profit maintains current margin ratio
    const projectedRevenue = contract > 0 ? contract : rev;
    const projectedProfit  = round2(projectedRevenue * (profitMarginPct / 100));

    return {
        revenue: rev,
        directCosts: dir,
        laborCosts: labor,
        materialCosts: mat,
        subcontractorCosts: sub,
        overheadAllocation: over,
        totalCost,
        grossProfit,
        netProfit,
        profitMarginPct,
        projectedRevenue,
        projectedProfit
    };
}

/**
 * Calculate Department Profitability Margin.
 */
function computeDepartmentProfitability({
    revenueAllocated = 0,
    salaryCosts = 0,
    expenseCosts = 0,
    overheadCosts = 0
}) {
    const rev   = Number(revenueAllocated);
    const sal   = Number(salaryCosts);
    const exp   = Number(expenseCosts);
    const over  = Number(overheadCosts);

    const totalCosts = round2(sal + exp + over);
    const netProfit  = round2(rev - totalCosts);
    const marginPct  = rev > 0 ? round2((netProfit / rev) * 100) : 0;

    return {
        revenueAllocated: rev,
        salaryCosts: sal,
        expenseCosts: exp,
        overheadCosts: over,
        totalCosts,
        netProfit,
        marginPct
    };
}

/**
 * Calculate Company Profitability (EBITDA, Gross, Net, Margin).
 */
function computeCompanyProfitability({
    totalRevenue = 0,
    totalCOGS = 0,
    totalOPEX = 0,
    depreciation = 0,
    interest = 0,
    tax = 0
}) {
    const rev   = Number(totalRevenue);
    const cogs  = Number(totalCOGS);
    const opex  = Number(totalOPEX);
    const dep   = Number(depreciation);
    const int   = Number(interest);
    const tx    = Number(tax);

    const grossProfit = round2(rev - cogs);
    const ebitda      = round2(grossProfit - opex); // EBITDA = Revenue - COGS - OPEX (excluding dep/interest/tax)
    const ebit        = round2(ebitda - dep);
    const netProfit   = round2(ebit - int - tx);
    
    const netMarginPct = rev > 0 ? round2((netProfit / rev) * 100) : 0;

    return {
        totalRevenue: rev,
        totalCOGS: cogs,
        grossProfit,
        totalOPEX: opex,
        ebitda,
        ebit,
        netProfit,
        netMarginPct
    };
}

module.exports = {
    computeProjectProfitability,
    computeDepartmentProfitability,
    computeCompanyProfitability
};
