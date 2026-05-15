"use strict";

const prisma = require("../../../db");

const getTaxConfigs = async (companyId) => {
    return await prisma.taxConfiguration.findMany({
        where: { company_id: companyId },
        orderBy: { effective_from: "desc" }
    });
};

const createTaxConfig = async (companyId, data) => {
    return await prisma.taxConfiguration.create({
        data: {
            ...data,
            company_id: companyId
        }
    });
};

const updateTaxConfig = async (id, companyId, data) => {
    return await prisma.taxConfiguration.update({
        where: { id, company_id: companyId },
        data
    });
};

module.exports = {
    getTaxConfigs,
    createTaxConfig,
    updateTaxConfig
};
