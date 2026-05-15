"use strict";

const prisma = require("../../../db");

const getPeriods = async (companyId) => {
    return await prisma.financialPeriod.findMany({
        where: { company_id: companyId },
        orderBy: { start_date: "desc" }
    });
};

const createPeriod = async (companyId, data) => {
    return await prisma.financialPeriod.create({
        data: {
            ...data,
            company_id: companyId
        }
    });
};

const updatePeriodStatus = async (id, companyId, status, userId) => {
    const data = { status };
    if (status === "locked" || status === "soft_closed") {
        data.closed_by = userId;
        data.closed_at = new Date();
    }
    return await prisma.financialPeriod.update({
        where: { id, company_id: companyId },
        data
    });
};

const deletePeriod = async (id, companyId) => {
    // Check if period has ledger entries
    const hasEntries = await prisma.ledgerEntry.findFirst({
        where: { period_id: id }
    });

    if (hasEntries) {
        throw new Error("Cannot delete a period that contains ledger entries. Lock it instead.");
    }

    return await prisma.financialPeriod.delete({
        where: { id, company_id: companyId }
    });
};

module.exports = {
    getPeriods,
    createPeriod,
    updatePeriodStatus,
    deletePeriod
};
