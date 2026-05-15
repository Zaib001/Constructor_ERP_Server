"use strict";

const prisma = require("../../../db");

const getAccounts = async (companyId) => {
    return await prisma.chartOfAccount.findMany({
        where: { company_id: companyId },
        include: {
            children: true
        },
        orderBy: { account_code: "asc" }
    });
};

const createAccount = async (companyId, data) => {
    return await prisma.chartOfAccount.create({
        data: {
            ...data,
            company_id: companyId
        }
    });
};

const updateAccount = async (id, companyId, data) => {
    return await prisma.chartOfAccount.update({
        where: { id, company_id: companyId },
        data
    });
};

const deleteAccount = async (id, companyId) => {
    // Check if account has ledger entries before deleting
    const hasEntries = await prisma.ledgerEntry.findFirst({
        where: { account_id: id }
    });

    if (hasEntries) {
        throw new Error("Cannot delete account with existing ledger entries. Deactivate it instead.");
    }

    return await prisma.chartOfAccount.delete({
        where: { id, company_id: companyId }
    });
};

module.exports = {
    getAccounts,
    createAccount,
    updateAccount,
    deleteAccount
};
