"use strict";

require("dotenv").config();
const prisma = require("./src/db");

const CUBIX_COMPANY_ID = "aea170b3-85c2-4884-9edb-21555b46b0a2";

/**
 * Standard Chart of Accounts for a construction company.
 * Follows a typical construction industry account structure.
 */
const DEFAULT_COA = [
    // ─── ASSETS ───────────────────────────────────────────────────────────────
    { account_code: "1000", account_name: "Current Assets", account_type: "asset", parent_code: null, is_control_account: true },
    { account_code: "1100", account_name: "Cash and Bank", account_type: "asset", parent_code: "1000", is_control_account: false },
    { account_code: "1200", account_name: "Trade Receivables (AR)", account_type: "asset", parent_code: "1000", is_control_account: false },
    { account_code: "1210", account_name: "VAT Recoverable (Input VAT)", account_type: "asset", parent_code: "1000", is_control_account: false },
    { account_code: "1300", account_name: "Advance Payments", account_type: "asset", parent_code: "1000", is_control_account: false },
    { account_code: "1400", account_name: "Inventory / Materials Stock", account_type: "asset", parent_code: "1000", is_control_account: false },
    { account_code: "1500", account_name: "Fixed Assets", account_type: "asset", parent_code: null, is_control_account: true },
    { account_code: "1510", account_name: "Property Plant & Equipment", account_type: "asset", parent_code: "1500", is_control_account: false },
    { account_code: "1520", account_name: "Accumulated Depreciation", account_type: "asset", parent_code: "1500", is_control_account: false },

    // ─── LIABILITIES ──────────────────────────────────────────────────────────
    { account_code: "2000", account_name: "Current Liabilities", account_type: "liability", parent_code: null, is_control_account: true },
    { account_code: "2100", account_name: "Trade Payables (AP)", account_type: "liability", parent_code: "2000", is_control_account: false },
    { account_code: "2200", account_name: "VAT Payable (Output VAT)", account_type: "liability", parent_code: "2000", is_control_account: false },
    { account_code: "2300", account_name: "Accrued Expenses", account_type: "liability", parent_code: "2000", is_control_account: false },
    { account_code: "2400", account_name: "Advance from Clients", account_type: "liability", parent_code: "2000", is_control_account: false },
    { account_code: "2500", account_name: "Salary Payable", account_type: "liability", parent_code: "2000", is_control_account: false },

    // ─── EQUITY ───────────────────────────────────────────────────────────────
    { account_code: "3000", account_name: "Owner Equity", account_type: "equity", parent_code: null, is_control_account: true },
    { account_code: "3100", account_name: "Share Capital", account_type: "equity", parent_code: "3000", is_control_account: false },
    { account_code: "3200", account_name: "Retained Earnings", account_type: "equity", parent_code: "3000", is_control_account: false },

    // ─── INCOME ───────────────────────────────────────────────────────────────
    { account_code: "4000", account_name: "Revenue", account_type: "income", parent_code: null, is_control_account: true },
    { account_code: "4100", account_name: "Contract Revenue", account_type: "income", parent_code: "4000", is_control_account: false },
    { account_code: "4200", account_name: "Variation Order Revenue", account_type: "income", parent_code: "4000", is_control_account: false },
    { account_code: "4300", account_name: "Other Income", account_type: "income", parent_code: "4000", is_control_account: false },

    // ─── EXPENSES ─────────────────────────────────────────────────────────────
    { account_code: "5000", account_name: "Direct Project Costs", account_type: "expense", parent_code: null, is_control_account: true },
    { account_code: "5100", account_name: "Material Costs", account_type: "expense", parent_code: "5000", is_control_account: false },
    { account_code: "5200", account_name: "Labour Costs", account_type: "expense", parent_code: "5000", is_control_account: false },
    { account_code: "5300", account_name: "Subcontractor Costs", account_type: "expense", parent_code: "5000", is_control_account: false },
    { account_code: "5400", account_name: "Equipment / Plant Costs", account_type: "expense", parent_code: "5000", is_control_account: false },
    { account_code: "6000", account_name: "Overhead & Admin Expenses", account_type: "expense", parent_code: null, is_control_account: true },
    { account_code: "6100", account_name: "Salaries & Allowances", account_type: "expense", parent_code: "6000", is_control_account: false },
    { account_code: "6200", account_name: "Rent & Utilities", account_type: "expense", parent_code: "6000", is_control_account: false },
    { account_code: "6300", account_name: "Office & Admin Expenses", account_type: "expense", parent_code: "6000", is_control_account: false },
    { account_code: "6400", account_name: "Depreciation Expense", account_type: "expense", parent_code: "6000", is_control_account: false },
    { account_code: "6500", account_name: "Finance Charges & Interest", account_type: "expense", parent_code: "6000", is_control_account: false },
];

/**
 * Which COA account to map to each finance setting key.
 */
const FINANCE_SETTING_MAP = {
    ACCOUNT_RECEIVABLE: "1200",
    REVENUE_ACCOUNT: "4100",
    VAT_PAYABLE: "2200",
    ACCOUNTS_PAYABLE: "2100",
    PROJECT_COST: "5000",
    VAT_RECOVERABLE: "1210",
};

async function main() {
    console.log("========================================================");
    console.log("  Default Chart of Accounts Seeder for: cubix");
    console.log("========================================================\n");

    // 1. Verify company exists
    const company = await prisma.company.findUnique({ where: { id: CUBIX_COMPANY_ID } });
    if (!company) {
        console.error(`✖ Company with ID '${CUBIX_COMPANY_ID}' not found. Aborting.`);
        process.exit(1);
    }
    console.log(`✔ Company found: ${company.name} (${company.id})\n`);

    // 2. Check if COA already exists
    const existingCount = await prisma.chartOfAccount.count({ where: { company_id: CUBIX_COMPANY_ID } });
    if (existingCount > 0) {
        console.log(`ℹ  Found ${existingCount} existing COA entries. Skipping COA seed.`);
    } else {
        // 3. First pass — create parent accounts (no parent_code)
        console.log("📋 Creating Chart of Accounts...\n");
        const codeToId = {};

        const parents = DEFAULT_COA.filter(a => a.parent_code === null);
        for (const acc of parents) {
            const created = await prisma.chartOfAccount.create({
                data: {
                    company_id: CUBIX_COMPANY_ID,
                    account_code: acc.account_code,
                    account_name: acc.account_name,
                    account_type: acc.account_type,
                    is_control_account: acc.is_control_account,
                    is_active: true,
                }
            });
            codeToId[acc.account_code] = created.id;
            console.log(`  ✔ [${acc.account_code}] ${acc.account_name} (${acc.account_type})`);
        }

        // 4. Second pass — create child accounts with parent references
        const children = DEFAULT_COA.filter(a => a.parent_code !== null);
        for (const acc of children) {
            const parentId = codeToId[acc.parent_code] || null;
            const created = await prisma.chartOfAccount.create({
                data: {
                    company_id: CUBIX_COMPANY_ID,
                    account_code: acc.account_code,
                    account_name: acc.account_name,
                    account_type: acc.account_type,
                    parent_id: parentId,
                    is_control_account: acc.is_control_account,
                    is_active: true,
                }
            });
            codeToId[acc.account_code] = created.id;
            console.log(`  ✔ [${acc.account_code}] ${acc.account_name}`);
        }

        console.log(`\n✔ Created ${DEFAULT_COA.length} accounts.\n`);
    }

    // 5. Fetch all COA accounts to get their IDs
    const allAccounts = await prisma.chartOfAccount.findMany({ where: { company_id: CUBIX_COMPANY_ID } });
    const codeToId = {};
    allAccounts.forEach(a => { codeToId[a.account_code] = a.id; });

    // 6. Map finance settings
    console.log("🔗 Mapping Finance Settings...\n");
    const settingsToUpsert = [];

    for (const [settingKey, accountCode] of Object.entries(FINANCE_SETTING_MAP)) {
        const accountId = codeToId[accountCode];
        if (!accountId) {
            console.warn(`  ⚠  Account code ${accountCode} not found for setting ${settingKey}. Skipping.`);
            continue;
        }
        const account = allAccounts.find(a => a.account_code === accountCode);
        settingsToUpsert.push({ settingKey, accountId, accountName: account?.account_name });
    }

    await prisma.$transaction(
        settingsToUpsert.map(({ settingKey, accountId }) =>
            prisma.companyFinanceSetting.upsert({
                where: {
                    company_id_setting_key: {
                        company_id: CUBIX_COMPANY_ID,
                        setting_key: settingKey
                    }
                },
                update: { account_id: accountId },
                create: { company_id: CUBIX_COMPANY_ID, setting_key: settingKey, account_id: accountId }
            })
        )
    );

    for (const { settingKey, accountId, accountName } of settingsToUpsert) {
        const code = Object.entries(FINANCE_SETTING_MAP).find(([k]) => k === settingKey)?.[1];
        console.log(`  ✔ ${settingKey.padEnd(22)} → [${code}] ${accountName}`);
    }

    console.log("\n========================================================");
    console.log("  ✅ Done! Restart your server — it should now boot cleanly.");
    console.log("========================================================\n");
}

main()
    .catch(err => {
        console.error("\n✖ Error:", err.message);
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
