"use strict";

require("dotenv").config();
const prisma = require("./src/db");

/**
 * Maps setting keys to account_type and name keywords from chart_of_accounts.
 * Priority: account_type + name match first, then name-only, then type-only.
 */
const SETTING_ACCOUNT_MAPPING = {
    ACCOUNT_RECEIVABLE:  { types: ["asset", "current_asset"],          names: ["receivable", "ar", "trade receivable", "debtor"] },
    REVENUE_ACCOUNT:     { types: ["income", "revenue"],               names: ["revenue", "income", "sales", "contract revenue"] },
    VAT_PAYABLE:         { types: ["liability"],                        names: ["vat payable", "output vat", "tax payable", "vat output"] },
    ACCOUNTS_PAYABLE:    { types: ["liability", "current_liability"],   names: ["payable", "ap", "trade payable", "creditor", "accounts payable"] },
    PROJECT_COST:        { types: ["expense", "cost"],                  names: ["project cost", "direct cost", "construction cost", "cost of sales", "cogs", "contract cost"] },
    VAT_RECOVERABLE:     { types: ["asset", "expense"],                 names: ["vat recoverable", "input vat", "vat input", "vat refundable", "recoverable"] },
};

function findBestAccount(accounts, { types, names }) {
    // Pass 1: type + name
    for (const type of types) {
        for (const name of names) {
            const match = accounts.find(acc =>
                acc.account_type?.toLowerCase().includes(type) &&
                (acc.account_name?.toLowerCase().includes(name) || acc.account_code?.toLowerCase().includes(name))
            );
            if (match) return match;
        }
    }
    // Pass 2: name only
    for (const name of names) {
        const match = accounts.find(acc =>
            acc.account_name?.toLowerCase().includes(name) ||
            acc.account_code?.toLowerCase().includes(name)
        );
        if (match) return match;
    }
    // Pass 3: type only (pick first match)
    for (const type of types) {
        const match = accounts.find(acc => acc.account_type?.toLowerCase().includes(type));
        if (match) return match;
    }
    return null;
}

async function fixCompanyFinanceSettings(companyId, companyName) {
    console.log(`\n🔧 Processing: ${companyName} (${companyId})`);

    // Check which keys are missing
    const existingSettings = await prisma.companyFinanceSetting.findMany({
        where: { company_id: companyId }
    });
    const existingKeys = new Set(existingSettings.map(s => s.setting_key));
    const missingKeys = Object.keys(SETTING_ACCOUNT_MAPPING).filter(k => !existingKeys.has(k));

    if (missingKeys.length === 0) {
        console.log(`  ✔ All required finance settings already configured.`);
        return;
    }

    console.log(`  ⚠  Missing settings: ${missingKeys.join(", ")}`);

    // Fetch Chart of Accounts for this company
    const accounts = await prisma.chartOfAccount.findMany({
        where: { company_id: companyId, is_active: true }
    });

    if (accounts.length === 0) {
        // Fallback: try without is_active filter in case accounts exist but flag differs
        const allAccounts = await prisma.chartOfAccount.findMany({
            where: { company_id: companyId }
        });

        if (allAccounts.length === 0) {
            console.log(`  ✖  No Chart of Accounts found for this company.`);
            console.log(`     You must create a Chart of Accounts first via Finance → Chart of Accounts.`);
            console.log(`     Then re-run this script or use Finance → Settings → Account Mappings.`);
            return;
        }

        accounts.push(...allAccounts);
    }

    console.log(`  📊 Found ${accounts.length} COA accounts. Resolving mappings...`);
    console.log(`\n  Available accounts:`);
    accounts.forEach(a => console.log(`    [${a.account_type?.padEnd(20)}] ${a.account_code} - ${a.account_name}`));
    console.log();

    const toCreate = [];
    const unresolved = [];

    for (const key of missingKeys) {
        const mapping = SETTING_ACCOUNT_MAPPING[key];
        const match = findBestAccount(accounts, mapping);

        if (match) {
            toCreate.push({
                setting_key: key,
                account_id: match.id,
                account_name: match.account_name,
                account_code: match.account_code
            });
        } else {
            unresolved.push(key);
        }
    }

    if (toCreate.length > 0) {
        await prisma.$transaction(
            toCreate.map(entry =>
                prisma.companyFinanceSetting.upsert({
                    where: {
                        company_id_setting_key: {
                            company_id: companyId,
                            setting_key: entry.setting_key
                        }
                    },
                    update: { account_id: entry.account_id },
                    create: {
                        company_id: companyId,
                        setting_key: entry.setting_key,
                        account_id: entry.account_id
                    }
                })
            )
        );

        for (const entry of toCreate) {
            console.log(`  ✔ [${entry.setting_key}] → ${entry.account_code} "${entry.account_name}"`);
        }
    }

    if (unresolved.length > 0) {
        console.log(`\n  ⚠  Could NOT auto-resolve ${unresolved.length} settings (no matching COA account found):`);
        for (const key of unresolved) {
            const { types, names } = SETTING_ACCOUNT_MAPPING[key];
            console.log(`     - ${key}`);
            console.log(`       Tried types: [${types.join(", ")}]`);
            console.log(`       Tried names: [${names.join(", ")}]`);
        }
        console.log(`\n  👉 Map these manually in Finance → Settings → Account Mappings.`);
    }
}

async function main() {
    console.log("========================================================");
    console.log("  Finance Settings Auto-Seeder");
    console.log("========================================================");

    const allCompanies = await prisma.company.findMany({ where: { is_active: true } });
    console.log(`\nFound ${allCompanies.length} active company/companies.`);

    const requiredKeys = Object.keys(SETTING_ACCOUNT_MAPPING);

    for (const company of allCompanies) {
        const existingSettings = await prisma.companyFinanceSetting.findMany({
            where: { company_id: company.id }
        });
        const existingKeys = existingSettings.map(s => s.setting_key);
        const missingKeys = requiredKeys.filter(k => !existingKeys.includes(k));

        if (missingKeys.length > 0) {
            await fixCompanyFinanceSettings(company.id, company.name || company.id);
        } else {
            console.log(`\n✔ ${company.name || company.id}: All finance settings configured.`);
        }
    }

    console.log("\n========================================================");
    console.log("  Done. Restart your server to verify.");
    console.log("========================================================\n");
}

main()
    .catch(err => {
        console.error("\n✖ Error:", err.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
