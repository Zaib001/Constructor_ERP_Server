"use strict";
require("dotenv").config();

const prisma = require("../../db");

async function seedFinance(companyId) {
    console.log(`Seeding finance for company: ${companyId}`);

    // 1. Bank Account
    const bankAccount = await prisma.bankAccount.upsert({
        where: { id: "00000000-0000-0000-0000-000000000000" }, // Dummy ID for tracking or skip where if not needed
        update: {},
        create: {
            company_id: companyId,
            account_name: "Main Operations Account",
            account_no: "SA1234567890123456789012",
            bank_name: "Saudi National Bank (SNB)",
            branch: "Main Branch",
            currency: "SAR",
            is_default: true,
            is_active: true
        }
    });
    console.log("Bank account seeded.");

    // 2. Tax Configuration (15% VAT)
    const taxConfig = await prisma.taxConfiguration.create({
        data: {
            company_id: companyId,
            tax_name: "VAT 15%",
            tax_code: "VAT15",
            rate: 15.00,
            applies_to: "BOTH",
            is_active: true,
            effective_from: new Date("2020-07-01")
        }
    });
    console.log("Tax configuration seeded.");

    // 3. Financial Period (2026)
    const currentPeriod = await prisma.financialPeriod.create({
        data: {
            company_id: companyId,
            period_name: "May 2026",
            start_date: new Date("2026-05-01"),
            end_date: new Date("2026-05-31"),
            status: "open"
        }
    });
    console.log("Financial period seeded.");

    // 4. Chart of Accounts
    const coaData = [
        // Assets
        { code: "1000", name: "Current Assets", type: "ASSET", is_control: true },
        { code: "1100", name: "Cash and Bank", type: "ASSET", parent_code: "1000" },
        { code: "1200", name: "Accounts Receivable", type: "ASSET", parent_code: "1000", is_control: true },
        { code: "1300", name: "Inventory", type: "ASSET", parent_code: "1000", is_control: true },
        
        // Liabilities
        { code: "2000", name: "Current Liabilities", type: "LIABILITY", is_control: true },
        { code: "2100", name: "Accounts Payable", type: "LIABILITY", parent_code: "2000", is_control: true },
        { code: "2200", name: "VAT Payable", type: "LIABILITY", parent_code: "2000" },
        { code: "2300", name: "Payroll Payable", type: "LIABILITY", parent_code: "2000" },
        { code: "2400", name: "Retentions Payable", type: "LIABILITY", parent_code: "2000" },

        // Equity
        { code: "3000", name: "Equity", type: "EQUITY", is_control: true },
        { code: "3100", name: "Share Capital", type: "EQUITY", parent_code: "3000" },
        { code: "3200", name: "Retained Earnings", type: "EQUITY", parent_code: "3000" },

        // Revenue
        { code: "4000", name: "Revenue", type: "REVENUE", is_control: true },
        { code: "4100", name: "Project Revenue", type: "REVENUE", parent_code: "4000" },

        // Expenses
        { code: "5000", name: "Project Costs", type: "EXPENSE", is_control: true },
        { code: "5100", name: "Material Cost", type: "EXPENSE", parent_code: "5000" },
        { code: "5200", name: "Labor Cost", type: "EXPENSE", parent_code: "5000" },
        { code: "5300", name: "Equipment Cost", type: "EXPENSE", parent_code: "5000" },
        { code: "5400", name: "Subcontractor Cost", type: "EXPENSE", parent_code: "5000" },
        { code: "6000", name: "Operating Expenses", type: "EXPENSE", is_control: true },
        { code: "6100", name: "Salary Expense", type: "EXPENSE", parent_code: "6000" },
        { code: "6200", name: "VAT Input (Recoverable)", type: "EXPENSE", parent_code: "6000" }
    ];

    const codeToId = {};

    for (const account of coaData) {
        const created = await prisma.chartOfAccount.create({
            data: {
                company_id: companyId,
                account_code: account.code,
                account_name: account.name,
                account_type: account.type,
                is_control_account: account.is_control || false,
                parent_id: account.parent_code ? codeToId[account.parent_code] : null
            }
        });
        codeToId[account.code] = created.id;
    }
    console.log("Chart of Accounts seeded.");
}

// Get the first company to seed
async function run() {
    try {
        const company = await prisma.company.findFirst();
        if (!company) {
            console.error("No company found to seed.");
            return;
        }
        await seedFinance(company.id);
        console.log("Finance seeding complete.");
    } catch (err) {
        console.error("Seeding error:", err);
    } finally {
        await prisma.$disconnect();
    }
}

run();
