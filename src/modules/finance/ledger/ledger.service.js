"use strict";

const prisma = require("../../../db");

/**
 * Get general ledger entries with filtering
 */
const getLedgerEntries = async (companyId, filters = {}) => {
    const { account_id, project_id, period_id, start_date, end_date } = filters;
    
    return await prisma.ledgerEntry.findMany({
        where: {
            company_id: companyId,
            account_id: account_id || undefined,
            project_id: project_id || undefined,
            period_id: period_id || undefined,
            posting_date: {
                gte: start_date ? new Date(start_date) : undefined,
                lte: end_date ? new Date(end_date) : undefined
            }
        },
        include: {
            account: true,
            voucher: true
        },
        orderBy: { posting_date: "asc" }
    });
};

/**
 * Trial Balance
 * Summarizes DR/CR/Balance per account
 */
const getTrialBalance = async (companyId, filters = {}) => {
    const { start_date, end_date } = filters;

    // Group by account
    const aggregates = await prisma.ledgerEntry.groupBy({
        by: ["account_id"],
        where: {
            company_id: companyId,
            posting_date: {
                gte: start_date ? new Date(start_date) : undefined,
                lte: end_date ? new Date(end_date) : undefined
            }
        },
        _sum: {
            debit: true,
            credit: true
        }
    });

    // Enhance with account details
    const accounts = await prisma.chartOfAccount.findMany({
        where: { company_id: companyId }
    });

    return aggregates.map(agg => {
        const account = accounts.find(a => a.id === agg.account_id);
        const totalDebit = Number(agg._sum.debit || 0);
        const totalCredit = Number(agg._sum.credit || 0);
        
        return {
            account_id: agg.account_id,
            account_code: account?.account_code,
            account_name: account?.account_name,
            account_type: account?.account_type,
            total_debit: totalDebit,
            total_credit: totalCredit,
            balance: totalDebit - totalCredit
        };
    });
};

module.exports = {
    getLedgerEntries,
    getTrialBalance
};
