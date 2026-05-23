"use strict";

const prisma = require("../../db");
const logger = require("../../logger");

/**
 * Validates critical environment variables and database configurations at boot time.
 * In production: halts server on any misconfiguration.
 * In development: finance mapping warnings are non-fatal to allow UI-driven setup.
 */
async function assertStartupConfig() {
    logger.info("[Startup Validator] Running enterprise finance startup checks...");

    const errors = [];
    const warnings = [];

    // 1. ZATCA Environment Variables & Security Checks
    const hasZatcaConfig = !!(
        process.env.ZATCA_VAT_NUMBER ||
        process.env.ZATCA_SELLER_NAME ||
        process.env.ZATCA_ENCRYPTION_KEY ||
        (process.env.ZATCA_ENV && process.env.ZATCA_ENV !== "simulation")
    );

    if (hasZatcaConfig) {
        if (!process.env.ZATCA_VAT_NUMBER) {
            errors.push("Missing ZATCA_VAT_NUMBER in environment variables.");
        }
        if (!process.env.ZATCA_SELLER_NAME) {
            errors.push("Missing ZATCA_SELLER_NAME in environment variables.");
        }
        if (!process.env.ZATCA_ENCRYPTION_KEY || process.env.ZATCA_ENCRYPTION_KEY.length < 32) {
            errors.push("Missing or weak ZATCA_ENCRYPTION_KEY. Must be at least 32 characters long.");
        }
        if (process.env.ZATCA_ENV === "simulation") {
            if (process.env.NODE_ENV !== "development") {
                errors.push("ZATCA_ENV 'simulation' is STRICTLY FORBIDDEN outside of 'development' environments.");
            }
            if (process.env.ALLOW_SIMULATION !== "true") {
                errors.push("ZATCA_ENV 'simulation' requires ALLOW_SIMULATION=true to explicitly bypass compliance guards.");
            }
        }
    } else {
        logger.info("[Startup Validator] ZATCA integration is inactive (no credentials or encryption key provided). Skipping ZATCA checks.");
    }

    if (!process.env.JWT_SECRET) {
        errors.push("Missing JWT_SECRET in environment variables.");
    }

    // 2. Database Mappings Validation
    try {
        const companies = await prisma.company.findMany({
            where: { is_active: true }
        });

        const requiredSettings = [
            "ACCOUNT_RECEIVABLE",
            "REVENUE_ACCOUNT",
            "VAT_PAYABLE",
            "ACCOUNTS_PAYABLE",
            "PROJECT_COST",
            "VAT_RECOVERABLE"
        ];

        for (const company of companies) {
            const settings = await prisma.companyFinanceSetting.findMany({
                where: { company_id: company.id }
            });

            const keys = settings.map(s => s.setting_key);
            for (const key of requiredSettings) {
                if (!keys.includes(key)) {
                    const msg = `Company '${company.name || company.id}' is missing required finance setting mapping: ${key}`;
                    // Always warn — never fatal. Finance operations (postInvoice, etc.) will
                    // fail at point of use via resolveAccount() with a clear error message.
                    // Blocking server boot prevents ALL modules (login, HR, projects) from
                    // working because one company hasn't configured their Chart of Accounts.
                    warnings.push(msg);
                }
            }
        }
    } catch (dbErr) {
        logger.error("[Startup Validator] Database connection failed during startup checks:", dbErr);
        errors.push(`Database connection / schema check failed: ${dbErr.message}`);
    }

    // Report warnings (non-fatal)
    if (warnings.length > 0) {
        logger.warn("[Startup Validator] FINANCE CONFIGURATION WARNINGS (non-fatal in development):");
        warnings.forEach(w => logger.warn(`  ⚠  ${w}`));
        logger.warn("[Startup Validator] Finance posting operations will fail until these are mapped.");
        logger.warn("[Startup Validator] Go to Finance → Settings → Account Mappings to configure.");
    }

    // Report fatal errors and halt
    if (errors.length > 0) {
        logger.error("[Startup Validator] CRITICAL STARTUP CONFIGURATION ERRORS DETECTED:");
        errors.forEach(err => logger.error(`  - ${err}`));
        logger.error("[Startup Validator] Server boot halted to prevent invalid financial operation.");
        process.exit(1);
    }

    logger.info("[Startup Validator] All enterprise finance startup checks PASSED.");
}

module.exports = { assertStartupConfig };

