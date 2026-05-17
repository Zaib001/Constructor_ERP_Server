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
    if (ZATCA_ENV === "simulation") {
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

    // Real API integration
    if (!ZATCA_API_URL) {
        throw new Error("ZATCA_API_URL is required but not configured for non-simulation environments.");
    }

    const headers = {
        "Content-Type": "application/json",
        "Accept-Language": "en",
        "Accept": "application/json",
    };

    // Include authentication headers if configured
    if (process.env.ZATCA_CLIENT_ID && process.env.ZATCA_CLIENT_SECRET) {
        const auth = Buffer.from(`${process.env.ZATCA_CLIENT_ID}:${process.env.ZATCA_CLIENT_SECRET}`).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
    } else if (process.env.ZATCA_CERTIFICATE) {
        // Alternative certificate-based authentications can go here
        headers["X-Clearance-Auth"] = "Bearer client_cert_token";
    }

    logger.info(`[ZATCA API] Sending invoice ${payload.uuid} to ${ZATCA_API_URL}...`);

    try {
        const response = await axios.post(
            `${ZATCA_API_URL}/invoices/clearance`,
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
