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

const getVATDashboard = async (companyId) => {
    const now = new Date();
    const periodMonth = now.toISOString().slice(0, 7);

    // Sum input and output VAT
    const [output, input] = await Promise.all([
        prisma.vATTransaction.aggregate({
            where: { company_id: companyId, direction: "OUTPUT" },
            _sum: { vat_amount: true, taxable_amount: true }
        }),
        prisma.vATTransaction.aggregate({
            where: { company_id: companyId, direction: "INPUT" },
            _sum: { vat_amount: true, taxable_amount: true }
        })
    ]);

    const outputVAT = Number(output._sum.vat_amount || 0);
    const inputVAT  = Number(input._sum.vat_amount || 0);

    // Fetch last 5 ZATCA submissions
    const recentSubmissions = await prisma.zATCASubmission.findMany({
        where: { company_id: companyId },
        include: {
            invoice: { select: { invoice_no: true, total_amount: true, vat_amount: true } }
        },
        take: 5,
        orderBy: { created_at: "desc" }
    });

    return {
        outputVAT,
        inputVAT,
        netVATPayable: outputVAT - inputVAT,
        outputTaxable: Number(output._sum.taxable_amount || 0),
        inputTaxable:  Number(input._sum.taxable_amount || 0),
        recentSubmissions
    };
};

const getZATCADashboard = async (companyId) => {
    // 1. Group submission status counts
    const submissions = await prisma.zATCASubmission.groupBy({
        by: ["status"],
        where: { company_id: companyId },
        _count: { id: true }
    });

    const counts = {
        QUEUED: 0,
        ACCEPTED: 0,
        REJECTED: 0,
        CLEARED: 0,
        FAILED: 0,
        RETRYING: 0
    };

    submissions.forEach(group => {
        if (counts[group.status] !== undefined) {
            counts[group.status] = group._count.id;
        }
    });

    const totalSubmissions = Object.values(counts).reduce((a, b) => a + b, 0);
    const acceptedCount = counts.ACCEPTED + counts.CLEARED;
    const complianceRate = totalSubmissions > 0 ? Math.round((acceptedCount / totalSubmissions) * 100) : 100;

    // 2. Fetch failed submissions requiring manual attention
    const failedRequiringAttention = await prisma.zATCASubmission.findMany({
        where: { company_id: companyId, status: { in: ["FAILED", "REJECTED"] } },
        include: {
            invoice: { select: { invoice_no: true, total_amount: true } }
        },
        take: 10,
        orderBy: { updated_at: "desc" }
    });

    return {
        counts,
        complianceRate,
        failedRequiringAttention,
        totalSubmissions
    };
};

const getProfitabilityKPIs = async (companyId) => {
    const periodMonth = new Date().toISOString().slice(0, 7);

    // Fetch company profit snapshot
    const companySnapshot = await prisma.profitSnapshot.findUnique({
        where: { company_id_period_month: { company_id: companyId, period_month: periodMonth } }
    });

    // Fetch top 5 high-performing projects
    const topProjects = await prisma.projectProfitSnapshot.findMany({
        where: { company_id: companyId, period_month: periodMonth },
        include: {
            project: { select: { name: true, code: true } }
        },
        orderBy: { profit_margin_pct: "desc" },
        take: 5
    });

    // Fetch top performing departments
    const topDepartments = await prisma.departmentProfitSnapshot.findMany({
        where: { company_id: companyId, period_month: periodMonth },
        include: {
            department: { select: { name: true } }
        },
        orderBy: { margin_pct: "desc" },
        take: 5
    });

    return {
        companySnapshot: companySnapshot || {
            total_revenue: 0,
            total_cogs: 0,
            gross_profit: 0,
            total_opex: 0,
            ebitda: 0,
            net_profit: 0,
            net_margin_pct: 0
        },
        topProjects,
        topDepartments
    };
};

module.exports = {
    getSummary,
    getAgingReport,
    getVATDashboard,
    getZATCADashboard,
    getProfitabilityKPIs
};
