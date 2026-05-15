"use strict";

const prisma = require("../../../db");

const getBankAccounts = async (companyId) => {
    return await prisma.bankAccount.findMany({
        where: { company_id: companyId },
        orderBy: { is_default: "desc" }
    });
};

const createBankAccount = async (companyId, data) => {
    return await prisma.bankAccount.create({
        data: {
            ...data,
            company_id: companyId
        }
    });
};

const updateBankAccount = async (id, companyId, data) => {
    return await prisma.bankAccount.update({
        where: { id, company_id: companyId },
        data
    });
};

module.exports = {
    getBankAccounts,
    createBankAccount,
    updateBankAccount
};
