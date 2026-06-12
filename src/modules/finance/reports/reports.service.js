"use strict";

const prisma = require("../../../db");

/**
 * Profit & Loss Report
 * Calculates Net Income for a given period
 */
const getPnL = async (companyId, filters = {}) => {
    const { start_date, end_date } = filters;

    const entries = await prisma.ledgerEntry.findMany({
        where: {
            company_id: companyId,
            posting_date: {
                gte: start_date ? new Date(start_date) : undefined,
                lte: end_date ? new Date(end_date) : undefined
            },
            account: {
                account_type: { in: ["Income", "Expense"] }
            }
        },
        include: { account: true }
    });

    const income = [];
    const expenses = [];

    entries.forEach(e => {
        const amount = Number(e.debit) - Number(e.credit);
        const item = {
            account_id: e.account_id,
            account_name: e.account.account_name,
            account_code: e.account.account_code,
            amount: Math.abs(amount)
        };

        if (e.account.account_type === "Income") {
            // Income: CR - DR
            const incomeAmt = Number(e.credit) - Number(e.debit);
            const existing = income.find(i => i.account_id === e.account_id);
            if (existing) existing.amount += incomeAmt;
            else income.push({ ...item, amount: incomeAmt });
        } else {
            // Expense: DR - CR
            const expenseAmt = Number(e.debit) - Number(e.credit);
            const existing = expenses.find(i => i.account_id === e.account_id);
            if (existing) existing.amount += expenseAmt;
            else expenses.push({ ...item, amount: expenseAmt });
        }
    });

    const totalIncome = income.reduce((sum, i) => sum + i.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
        income,
        expenses,
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses
    };
};

/**
 * Balance Sheet
 * Assets = Liabilities + Equity
 */
const getBalanceSheet = async (companyId, date = new Date()) => {
    const entries = await prisma.ledgerEntry.findMany({
        where: {
            company_id: companyId,
            posting_date: { lte: new Date(date) },
            account: {
                account_type: { in: ["Asset", "Liability", "Equity"] }
            }
        },
        include: { account: true }
    });

    const assets = [];
    const liabilities = [];
    const equity = [];

    entries.forEach(e => {
        const drAmt = Number(e.debit);
        const crAmt = Number(e.credit);
        
        let balance = 0;
        if (e.account.account_type === "Asset") balance = drAmt - crAmt;
        else balance = crAmt - drAmt; // Liabilities & Equity

        const target = e.account.account_type === "Asset" ? assets : 
                     e.account.account_type === "Liability" ? liabilities : equity;
        
        const existing = target.find(i => i.account_id === e.account_id);
        if (existing) existing.balance += balance;
        else target.push({
            account_id: e.account_id,
            account_name: e.account.account_name,
            account_code: e.account.account_code,
            balance
        });
    });

    const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + l.balance, 0);
    const totalEquity = equity.reduce((sum, e) => sum + e.balance, 0);

    // Dynamic Net Income Integration
    const pnl = await getPnL(companyId, { end_date: date });
    const netIncome = pnl.netProfit;

    return {
        assets,
        liabilities,
        equity: [
            ...equity,
            { account_id: "NET_INCOME", account_name: "Net Profit / (Loss)", account_code: "P&L", balance: netIncome }
        ],
        totalAssets,
        totalLiabilities,
        totalEquity: totalEquity + netIncome,
        netIncome,
        isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 0.01
    };
};

/**
 * Trial Balance Report
 * Verifies Total Debits == Total Credits
 */
const getTrialBalance = async (companyId, date = new Date()) => {
    const entries = await prisma.ledgerEntry.groupBy({
        by: ["account_id"],
        where: {
            company_id: companyId,
            posting_date: { lte: new Date(date) }
        },
        _sum: { debit: true, credit: true }
    });

    const accounts = await prisma.chartOfAccount.findMany({
        where: { company_id: companyId }
    });

    const report = accounts.map(acc => {
        const entry = entries.find(e => e.account_id === acc.id);
        const dr = Number(entry?._sum.debit || 0);
        const cr = Number(entry?._sum.credit || 0);
        
        return {
            account_id: acc.id,
            account_name: acc.account_name,
            account_code: acc.account_code,
            account_type: acc.account_type,
            debit: dr,
            credit: cr,
            balance: dr - cr
        };
    }).filter(a => a.debit !== 0 || a.credit !== 0);

    const totalDebit = report.reduce((sum, a) => sum + a.debit, 0);
    const totalCredit = report.reduce((sum, a) => sum + a.credit, 0);

    return {
        data: report,
        totalDebit,
        totalCredit,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01
    };
};

/**
 * Cash Flow Statement
 * Direct method: Tracking cash account movements
 */
const { resolveAccount } = require("../finance.utils");

const getCashFlow = async (companyId, filters = {}) => {
    const { start_date, end_date } = filters;

    let bankAccountId = undefined;
    try {
        const bankAccountAcc = await resolveAccount(companyId, 'BANK_ACCOUNT');
        bankAccountId = bankAccountAcc.id;
    } catch (e) {
        return { operating: 0, investing: 0, financing: 0, netCashFlow: 0 };
    }

    const entries = await prisma.ledgerEntry.findMany({
        where: {
            company_id: companyId,
            posting_date: {
                gte: start_date ? new Date(start_date) : undefined,
                lte: end_date ? new Date(end_date) : undefined
            },
            account_id: bankAccountId
        },
        include: { voucher: true }
    });

    const categories = {
        operating: 0,
        investing: 0,
        financing: 0
    };

    entries.forEach(e => {
        const amount = Number(e.debit) - Number(e.credit);
        // Categorize based on voucher event type
        const event = e.voucher.event_type;
        if (event.includes("INVOICE") || event.includes("BILL") || event.includes("PAYROLL")) {
            categories.operating += amount;
        } else if (event.includes("ASSET") || event.includes("INVESTMENT")) {
            categories.investing += amount;
        } else {
            categories.financing += amount;
        }
    });

    return {
        ...categories,
        netCashFlow: categories.operating + categories.investing + categories.financing
    };
};

const projectsFinanceService = require("../../projects/finance.service");

const getBudgetVsActualReport = async (companyId, filters, user) => {
    const { projectId, costCodeFilter, from, to } = filters;

    if (projectId) {
        // Detailed project-specific report
        return await projectsFinanceService.getBudgetVsActual(user, {
            projectId,
            costCodeFilter,
            from,
            to
        });
    }

    // Consolidated company-wide report
    const projects = await prisma.project.findMany({
        where: {
            company_id: companyId,
            status: "active",
            deleted_at: null
        },
        select: { id: true, name: true, code: true }
    });

    const projectData = await Promise.all(projects.map(async (proj) => {
        try {
            const result = await projectsFinanceService.getBudgetVsActual(user, {
                projectId: proj.id,
                costCodeFilter,
                from,
                to
            });

            return {
                projectId: proj.id,
                projectName: proj.name,
                projectCode: proj.code,
                totalBudget: result.summary.totalBudget,
                totalActual: result.summary.totalActual,
                totalVariance: result.summary.totalVariance,
                variancePercent: result.summary.variancePercent,
                status: result.summary.totalActual > result.summary.totalBudget ? "OVERSPENT" :
                        result.summary.totalActual > result.summary.totalBudget * 0.85 ? "AT_RISK" : "ON_TRACK"
            };
        } catch (err) {
            // If there's an error for a project (e.g. scoping / no access), return basic info
            return {
                projectId: proj.id,
                projectName: proj.name,
                projectCode: proj.code,
                totalBudget: 0,
                totalActual: 0,
                totalVariance: 0,
                variancePercent: 0,
                status: "UNKNOWN",
                error: err.message
            };
        }
    }));

    const totalBudget = projectData.reduce((sum, p) => sum + p.totalBudget, 0);
    const totalActual = projectData.reduce((sum, p) => sum + p.totalActual, 0);
    const totalVariance = totalBudget - totalActual;
    const variancePercent = totalBudget > 0 ? parseFloat(((totalActual / totalBudget) * 100).toFixed(2)) : 0;

    return {
        companyId,
        generatedAt: new Date().toISOString(),
        summary: {
            totalBudget: parseFloat(totalBudget.toFixed(2)),
            totalActual: parseFloat(totalActual.toFixed(2)),
            totalVariance: parseFloat(totalVariance.toFixed(2)),
            variancePercent
        },
        projects: projectData
    };
};

module.exports = {
    getPnL,
    getBalanceSheet,
    getTrialBalance,
    getCashFlow,
    getBudgetVsActualReport
};
