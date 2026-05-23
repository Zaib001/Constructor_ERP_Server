"use strict";

/**
 * zatca.api.js — Environment-gated ZATCA Gateway Client
 * ─────────────────────────────────────────────────────────────────────────────
 * Communicates with ZATCA's Developer Portal, Compliance, or Production gateways.
 * Transparently isolates modes using ZATCA_ENV (simulation|sandbox|staging|production).
 */

const axios = require("axios");
const logger = require("../../../logger");

const ZATCA_ENV = process.env.ZATCA_ENV || "simulation";
const ZATCA_API_URL = process.env.ZATCA_API_URL || "";

/**
 * Submit invoice payload to ZATCA endpoint.
 */
async function submitInvoiceToGateway(payload, companyId) {
    // Real API integration
    const prisma = require("../../../db");
    const { decrypt } = require("./zatca.utils");

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    let config = null;

    if (uuidRegex.test(companyId)) {
        config = await prisma.zATCAConfiguration.findUnique({
            where: { company_id: companyId }
        });
    } else {
        // Fallback for automated tests or mock identifiers in simulation mode
        if (ZATCA_ENV === "simulation") {
            config = { zatca_env: "simulation" };
        }
    }

    if (!config) {
        throw new Error("ZATCA Configuration missing for company.");
    }

    const env = config.zatca_env || ZATCA_ENV;

    if (env === "simulation") {
        if (process.env.NODE_ENV !== "development" || process.env.ALLOW_SIMULATION !== "true") {
            throw new Error("Simulation mode is strictly blocked in this environment. Cannot submit to mock gateway.");
        }
        logger.info(`[ZATCA API] [SIMULATION] Invoice ${payload.uuid} submitted to mock gate.`);
        // Simulate a successful ZATCA Phase 2 clearance response after 350ms delay
        await new Promise(resolve => setTimeout(resolve, 350));
        return {
            status: 200,
            data: {
                validationResults: {
                    status: "PASS",
                    infoMessages: [{ type: "INFO", code: "VAL-001", category: "UBL validation", message: "Successful validation" }],
                    warningMessages: [],
                    errorMessages: []
                },
                reportingStatus: "REPORTED",
                clearanceStatus: "CLEARED",
                clearedInvoice: payload.invoice // In production, this would be the signed/stamped XML returned by ZATCA
            }
        };
    }

    // Determine Base URL (Developer Portal Sandbox vs Production Core)
    const baseUrl = env === "production" 
        ? "https://gw-fatoora.zatca.gov.sa/e-invoicing/core" 
        : "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal";
        
    const finalUrl = ZATCA_API_URL || baseUrl;

    const headers = {
        "Content-Type": "application/json",
        "Accept-Language": "en",
        "Accept": "application/json",
        "Clearance-Status": "1" // Standard ZATCA requirement flag
    };

    // Inject real CSID authentication
    // ZATCA requires Basic Auth where Username = BinarySecurityToken (CSID/PCSID) and Password = Secret
    const binarySecurityToken = config.pcsid ? decrypt(config.pcsid) : config.csid ? decrypt(config.csid) : null;
    const clientSecret = config.client_secret_encrypted ? decrypt(config.client_secret_encrypted) : null;

    if (binarySecurityToken && clientSecret) {
        const auth = Buffer.from(`${binarySecurityToken}:${clientSecret}`).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
    } else {
        throw new Error("ZATCA API Authentication missing: PCSID/CSID and Client Secret are required.");
    }

    logger.info(`[ZATCA API] Sending invoice ${payload.uuid} to ${finalUrl}...`);

    try {
        const response = await axios.post(
            `${finalUrl}/invoices/clearance`,
            payload,
            { headers, timeout: 15000 }
        );
        return {
            status: response.status,
            data: response.data
        };
    } catch (err) {
        logger.error("[ZATCA API] Connection error", {
            message: err.message,
            response: err.response?.data
        });
        throw {
            status: err.response?.status || 500,
            message: err.message,
            data: err.response?.data || { error: "Gateway connection failed" }
        };
    }
}

module.exports = { submitInvoiceToGateway };
