"use strict";

const prisma = require("../../../db");

const { resolveAccount } = require("../finance.utils");

const getSummary = async (companyId) => {
    // 1. Total Receivables
    let totalReceivables = 0;
    try {
        const arAccount = await resolveAccount(companyId, 'ACCOUNT_RECEIVABLE');
        const arBalance = await prisma.ledgerEntry.aggregate({
            where: {
                company_id: companyId,
                account_id: arAccount.id
            },
            _sum: { debit: true, credit: true }
        });
        totalReceivables = Number(arBalance._sum.debit || 0) - Number(arBalance._sum.credit || 0);
    } catch (e) {
        // Fallback to 0 if not configured
    }

    // 2. Total Payables
    let totalPayables = 0;
    try {
        const apAccount = await resolveAccount(companyId, 'ACCOUNTS_PAYABLE');
        const apBalance = await prisma.ledgerEntry.aggregate({
            where: {
                company_id: companyId,
                account_id: apAccount.id
            },
            _sum: { debit: true, credit: true }
        });
        totalPayables = Number(apBalance._sum.credit || 0) - Number(apBalance._sum.debit || 0);
    } catch (e) {
        // Fallback to 0
    }

    // 3. Cash & Bank Balance
    let totalCash = 0;
    let bankAccountId = undefined;
    try {
        const bankAccountAcc = await resolveAccount(companyId, 'BANK_ACCOUNT');
        bankAccountId = bankAccountAcc.id;
        const cashBalance = await prisma.ledgerEntry.aggregate({
            where: {
                company_id: companyId,
                account_id: bankAccountId
            },
            _sum: { debit: true, credit: true }
        });
        totalCash = Number(cashBalance._sum.debit || 0) - Number(cashBalance._sum.credit || 0);
    } catch (e) {
        // Fallback to 0
    }

    // 4. Monthly Inflow/Outflow (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const cashFlow = bankAccountId ? await prisma.ledgerEntry.groupBy({
        by: ["posting_date"],
        where: {
            company_id: companyId,
            account_id: bankAccountId,
            posting_date: { gte: sixMonthsAgo }
        },
        _sum: { debit: true, credit: true }
    }) : [];

    return {
        totalReceivables,
        totalPayables,
        totalCash,
        cashFlow
    };
};

const getAgingReport = async (companyId, type = "AR") => {
    // AR Aging (from ClientInvoice) or AP Aging (from VendorBill)
    const model = type === "AR" ? "clientInvoice" : "vendorBill";
    
    const items = await prisma[model].findMany({
        where: {
            company_id: companyId,
            payment_status: { in: ["unpaid", "partial"] }
        },
        select: {
            id: true,
            invoice_no: true,
            bill_no: true,
            total_amount: true,
            outstanding: true,
            due_date: true
        }
    });

    const now = new Date();
    const buckets = {
        current: 0,
        "30_days": 0,
        "60_days": 0,
        "90_days": 0,
        over_90: 0
    };

    items.forEach(item => {
        const diffDays = Math.ceil((now - new Date(item.due_date)) / (1000 * 60 * 60 * 24));
        const amount = Number(item.outstanding);

        if (diffDays <= 0) buckets.current += amount;
        else if (diffDays <= 30) buckets["30_days"] += amount;
        else if (diffDays <= 60) buckets["60_days"] += amount;
        else if (diffDays <= 90) buckets["90_days"] += amount;
        else buckets.over_90 += amount;
    });

    return buckets;
};

module.exports = {
    getSummary,
    getAgingReport
};
