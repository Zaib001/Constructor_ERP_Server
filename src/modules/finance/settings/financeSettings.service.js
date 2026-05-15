"use strict";

const prisma = require("../../../db");

const getSettings = async (companyId) => {
    return await prisma.companyFinanceSetting.findMany({
        where: { company_id: companyId },
        include: { account: true }
    });
};

const updateSettings = async (companyId, settings) => {
    // settings is an array of { setting_key, account_id }
    return await prisma.$transaction(
        settings.map(s => prisma.companyFinanceSetting.upsert({
            where: {
                company_id_setting_key: {
                    company_id: companyId,
                    setting_key: s.setting_key
                }
            },
            update: { account_id: s.account_id },
            create: {
                company_id: companyId,
                setting_key: s.setting_key,
                account_id: s.account_id
            }
        }))
    );
};

const getAvailableMappingKeys = () => {
    return [
        { key: 'ACCOUNT_RECEIVABLE', label: 'Default Accounts Receivable', category: 'Assets' },
        { key: 'BANK_ACCOUNT', label: 'Default Bank/Cash Account', category: 'Assets' },
        { key: 'REVENUE_ACCOUNT', label: 'Default Revenue Account', category: 'Income' },
        { key: 'VAT_PAYABLE', label: 'VAT Payable (Output VAT)', category: 'Liabilities' },
        { key: 'ACCOUNTS_PAYABLE', label: 'Default Accounts Payable', category: 'Liabilities' },
        { key: 'PROJECT_COST', label: 'Direct Project Cost', category: 'Expenses' },
        { key: 'VAT_RECOVERABLE', label: 'VAT Recoverable (Input VAT)', category: 'Assets/Expenses' },
        { key: 'PAYROLL_EXPENSE', label: 'Basic Salary Expense', category: 'Expenses' },
        { key: 'PAYROLL_PAYABLE', label: 'Salary Payable', category: 'Liabilities' }
    ];
};

module.exports = {
    getSettings,
    updateSettings,
    getAvailableMappingKeys
};
