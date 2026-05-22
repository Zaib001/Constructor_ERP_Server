"use strict";

const prisma = require("../../db");

/**
 * Generates a unique sequence number for financial documents
 * Uses a transactional counter to prevent race conditions.
 */
async function generateSequenceNo(companyId, type, prefix, txClient) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    const execute = async (tx) => {
        const rows = await tx.$queryRaw`
            SELECT last_value 
            FROM "auth"."finance_sequences" 
            WHERE company_id = ${companyId}::uuid AND type = ${type}
            FOR UPDATE
        `;

        if (rows && rows.length > 0) {
            const nextVal = rows[0].last_value + 1;
            await tx.$executeRaw`
                UPDATE "auth"."finance_sequences" 
                SET last_value = ${nextVal} 
                WHERE company_id = ${companyId}::uuid AND type = ${type}
            `;
            return nextVal;
        } else {
            const created = await tx.financeSequence.create({
                data: {
                    company_id: companyId,
                    type: type,
                    prefix: prefix,
                    last_value: 1
                }
            });
            return created.last_value;
        }
    };

    let seqVal;
    if (txClient) {
        seqVal = await execute(txClient);
    } else {
        seqVal = await prisma.$transaction(execute);
    }

    const sequence = String(seqVal).padStart(4, "0");
    return `${prefix}-${yearMonth}-${sequence}`;
}

/**
 * Period guard logic
 * Ensures transactions aren't posted to locked periods
 */
async function checkPeriodGuard(companyId, postingDate) {
    const date = new Date(postingDate);
    
    const period = await prisma.financialPeriod.findFirst({
        where: {
            company_id: companyId,
            start_date: { lte: date },
            end_date: { gte: date }
        }
    });

    if (!period) {
        throw new Error("No financial period found for the specified date.");
    }

    if (period.status === "locked") {
        throw new Error(`Financial period '${period.period_name}' is locked. Cannot post transactions.`);
    }

    return period;
}

/**
 * Resolves a default account for a company based on a setting key.
 * Falls back to hardcoded defaults only if critical but logs a warning.
 */
async function resolveAccount(companyId, settingKey) {
    const setting = await prisma.companyFinanceSetting.findUnique({
        where: {
            company_id_setting_key: {
                company_id: companyId,
                setting_key: settingKey
            }
        },
        include: { account: true }
    });

    if (!setting || !setting.account) {
        throw new Error(`Critical Finance Error: Setting '${settingKey}' is not configured for this company. Please map this account in Finance Settings.`);
    }

    return setting.account;
}

module.exports = {
    generateSequenceNo,
    checkPeriodGuard,
    resolveAccount
};
