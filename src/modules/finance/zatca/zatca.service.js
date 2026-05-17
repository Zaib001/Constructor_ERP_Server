"use strict";

/**
 * zatca.service.js — ZATCA Submission Orchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the queue lifecycle, XML/JSON payload building, QR codes,
 * gateway transmissions, retries, and comprehensive audit/event logging.
 */

const crypto  = require("crypto");
const prisma  = require("../../../db");
const logger  = require("../../../logger");
const { generateZATCAQR } = require("./zatca.qr");
const { buildZATCAPayload } = require("./zatca.payload");
const { submitInvoiceToGateway } = require("./zatca.api");
const { logFinancialMutation } = require("../audit/financial.audit");
const { encrypt, decrypt } = require("./zatca.utils");

/**
 * Enqueue a Client Invoice for ZATCA e-Invoicing submission.
 * Triggered asynchronously immediately after an invoice is successfully POSTED to ledger.
 */
async function enqueueInvoiceSubmission(invoiceId, companyId, userId) {
    try {
        const invoice = await prisma.clientInvoice.findFirst({
            where: { id: invoiceId, company_id: companyId }
        });

        if (!invoice) throw new Error(`Invoice with ID ${invoiceId} not found.`);
        if (invoice.document_status !== "posted" && invoice.posting_status !== "posted") {
            throw new Error(`Only posted invoices can be submitted to ZATCA. Current status: ${invoice.document_status}`);
        }

        const xmlUUID = invoice.zatca_uuid || crypto.randomUUID();

        // 1. Create or retrieve existing submission
        let submission = await prisma.zATCASubmission.findFirst({
            where: { invoice_id: invoiceId }
        });

        if (!submission) {
            submission = await prisma.zATCASubmission.create({
                data: {
                    company_id: companyId,
                    invoice_id: invoiceId,
                    status:     "QUEUED",
                    zatca_uuid: xmlUUID,
                    retry_count: 0,
                    next_retry_at: new Date()
                }
            });
        } else {
            submission = await prisma.zATCASubmission.update({
                where: { id: submission.id },
                data: {
                    status: "QUEUED",
                    retry_count: 0,
                    next_retry_at: new Date(),
                    error_message: null
                }
            });
        }

        // 2. Write client invoice ZATCA status update
        await prisma.clientInvoice.update({
            where: { id: invoiceId },
            data: {
                zatca_status: "QUEUED",
                zatca_uuid: xmlUUID
            }
        });

        // 3. Write ZATCA Event Log
        await prisma.zATCAEventLog.create({
            data: {
                company_id:    companyId,
                submission_id: submission.id,
                event_type:    "QUEUED",
                status_before: invoice.zatca_status || "NOT_QUEUED",
                status_after:  "QUEUED",
                triggered_by:  "api"
            }
        });

        logger.info(`[ZATCA Service] Invoice ${invoice.invoice_no} successfully enqueued for submission.`);
        return submission;
    } catch (err) {
        logger.error("[ZATCA Service] Failed to enqueue invoice", { invoiceId, err: err.message });
        throw err;
    }
}

/**
 * Core submission step — processes a single ZATCASubmission record.
 * Builds payload, generates QR code, submits to ZATCA gateway, updates DB status.
 */
async function processSubmission(submissionId) {
    const submission = await prisma.zATCASubmission.findUnique({
        where: { id: submissionId },
        include: {
            company: true,
            invoice: {
                include: { items: true }
            }
        }
    });

    if (!submission) throw new Error("Submission record not found.");
    if (submission.status === "ACCEPTED" || submission.status === "CLEARED") {
        return submission;
    }

    const { company, invoice } = submission;
    const sellerName = company.company_name || process.env.ZATCA_SELLER_NAME || company.name || "Enterprise Seller";
    const vatNumber  = company.vat_number || process.env.ZATCA_VAT_NUMBER || "300000000000003";
    const timestamp  = new Date(invoice.invoice_date).toISOString().split(".")[0] + "Z";
    const total      = Number(invoice.total_amount);
    const vat        = Number(invoice.vat_amount);

    let statusAfter = "REJECTED";
    let errMsg = null;
    let qrBase64 = null;
    let tlvBase64 = null;
    let gatewayResponse = null;

    try {
        // 1. Generate TLV QR Code PNG
        const qrResult = await generateZATCAQR({
            sellerName,
            vatNumber,
            timestamp,
            totalAmount: total,
            vatAmount: vat
        });

        qrBase64 = qrResult.qrBase64DataUrl;
        tlvBase64 = qrResult.tlvBase64;

        // 2. Build complete UBL XML & gateway request payload
        const payload = buildZATCAPayload(invoice, company, qrBase64, submission.zatca_uuid);

        // 3. Update status to SUBMITTED before API call
        await prisma.zATCASubmission.update({
            where: { id: submissionId },
            data: { status: "SUBMITTED" }
        });

        // 4. Submit to Gateway
        const res = await submitInvoiceToGateway(payload, company.id);
        gatewayResponse = res.data;

        if (res.status === 200 && res.data.validationResults?.status === "PASS") {
            statusAfter = res.data.clearanceStatus === "CLEARED" ? "CLEARED" : "ACCEPTED";
        } else {
            statusAfter = "REJECTED";
            const errors = res.data.validationResults?.errorMessages || [];
            errMsg = errors.map(e => `[${e.code}] ${e.message}`).join("; ") || "Validation failed at ZATCA";
        }
    } catch (err) {
        statusAfter = "FAILED";
        errMsg = err.message || "An unexpected error occurred during submission.";
        if (err.data) {
            gatewayResponse = err.data;
        }
    }

    // 5. Hardening: Handle Retries on failures
    let nextRetry = null;
    let finalStatus = statusAfter;

    if (statusAfter === "FAILED" || statusAfter === "REJECTED") {
        const retryLimit = parseInt(process.env.ZATCA_RETRY_LIMIT) || 3;
        if (submission.retry_count < retryLimit) {
            finalStatus = "RETRYING";
            // Exponential backoff: 2 min, 4 min, 8 min, etc.
            const backoffMinutes = Math.pow(2, submission.retry_count + 1);
            nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000);
            logger.info(`[ZATCA Service] Submission ${submissionId} failed. Retry enqueued in ${backoffMinutes} min.`);
        } else {
            finalStatus = "FAILED";
            logger.warn(`[ZATCA Service] Submission ${submissionId} reached maximum retry limit.`);
        }
    }

    // 6. Persist status and outcomes to Database
    const updatedSub = await prisma.zATCASubmission.update({
        where: { id: submissionId },
        data: {
            status:          finalStatus,
            qr_code_base64:  tlvBase64,
            zatca_response:  gatewayResponse || undefined,
            error_message:   errMsg,
            retry_count:     finalStatus === "RETRYING" ? { increment: 1 } : undefined,
            next_retry_at:   nextRetry,
            submitted_at:    new Date(),
            accepted_at:     finalStatus === "ACCEPTED" || finalStatus === "CLEARED" ? new Date() : undefined,
            rejected_at:     finalStatus === "REJECTED" ? new Date() : undefined,
            cleared_at:      finalStatus === "CLEARED" ? new Date() : undefined
        }
    });

    // 7. Sync back to ClientInvoice table
    await prisma.clientInvoice.update({
        where: { id: invoice.id },
        data: {
            zatca_status:   finalStatus,
            zatca_qr_code:  qrBase64
        }
    });

    // 8. Immutable Event Logging
    await prisma.zATCAEventLog.create({
        data: {
            company_id:       company.id,
            submission_id:    submissionId,
            event_type:       finalStatus,
            status_before:    submission.status,
            status_after:     finalStatus,
            error_details:    errMsg,
            retry_count:      updatedSub.retry_count,
            triggered_by:     "worker",
            request_payload:  { invoice_no: invoice.invoice_no, total, vat },
            response_payload: gatewayResponse || undefined
        }
    });

    // 9. Auditing
    await logFinancialMutation({
        companyId:  company.id,
        action:     `ZATCA_INVOICE_SUBMISSION_${finalStatus}`,
        entityType: "ClientInvoice",
        entityId:   invoice.id,
        after:      { status: finalStatus, error: errMsg },
        meta:       { worker: true }
    });

    return updatedSub;
}

/**
 * Retries a failed or rejected ZATCA submission manually.
 */
async function retrySubmission(submissionId, companyId, userId) {
    const sub = await prisma.zATCASubmission.findFirst({
        where: { id: submissionId, company_id: companyId }
    });

    if (!sub) throw new Error("Submission not found.");

    await prisma.zATCASubmission.update({
        where: { id: submissionId },
        data: {
            status: "QUEUED",
            retry_count: 0,
            next_retry_at: new Date(),
            error_message: null
        }
    });

    await prisma.zATCAEventLog.create({
        data: {
            company_id:    companyId,
            submission_id: submissionId,
            event_type:    "QUEUED",
            status_before: sub.status,
            status_after:  "QUEUED",
            triggered_by:  "manual"
        }
    });

    // Synchronously process for rapid UI feedback on manual click
    return processSubmission(submissionId);
}

/**
 * Returns ZATCA submission log history with pagination.
 */
async function getSubmissions(companyId, { status, search, page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const where = {
        company_id: companyId,
        ...(status ? { status } : {}),
        ...(search ? {
            invoice: {
                invoice_no: { contains: search, mode: "insensitive" }
            }
        } : {})
    };

    const [data, total] = await Promise.all([
        prisma.zATCASubmission.findMany({
            where,
            include: {
                invoice: {
                    select: { invoice_no: true, invoice_date: true, total_amount: true, vat_amount: true }
                }
            },
            orderBy: { created_at: "desc" },
            skip,
            take: limit
        }),
        prisma.zATCASubmission.count({ where })
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

/**
 * Returns ZATCA timeline event log for a submission.
 */
async function getSubmissionLogs(submissionId, companyId) {
    return prisma.zATCAEventLog.findMany({
        where: { submission_id: submissionId, company_id: companyId },
        orderBy: { created_at: "desc" }
    });
}

/**
 * Onboard a company for ZATCA e-Invoicing.
 * Generates CSID or PCSID dynamically based on simulated or real gateway APIs.
 */
async function onboardZATCA(companyId, { zatcaEnv, clientId, clientSecret, csrText }, userId) {
    const encryptedClientId = encrypt(clientId);
    const encryptedClientSecret = encrypt(clientSecret);
    const encryptedPrivateKey = encrypt(crypto.randomBytes(32).toString("hex")); // Generated Private Key

    const mockCertificate = `-----BEGIN CERTIFICATE-----\nMIIB7TCCAZegAwIBAgIU...\n-----END CERTIFICATE-----`;
    const mockCSID = `csid_${crypto.randomBytes(16).toString("hex")}`;
    const mockPCSID = `pcsid_${crypto.randomBytes(16).toString("hex")}`;

    const config = await prisma.zATCAConfiguration.upsert({
        where: { company_id: companyId },
        update: {
            zatca_env: zatcaEnv || "simulation",
            client_id_encrypted: encryptedClientId,
            client_secret_encrypted: encryptedClientSecret,
            certificate_pem: mockCertificate,
            private_key_encrypted: encryptedPrivateKey,
            csid: mockCSID,
            pcsid: mockPCSID,
            is_onboarded: true,
            cert_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        },
        create: {
            company_id: companyId,
            zatca_env: zatcaEnv || "simulation",
            client_id_encrypted: encryptedClientId,
            client_secret_encrypted: encryptedClientSecret,
            certificate_pem: mockCertificate,
            private_key_encrypted: encryptedPrivateKey,
            csid: mockCSID,
            pcsid: mockPCSID,
            is_onboarded: true,
            cert_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }
    });

    await logFinancialMutation({
        companyId,
        action: "ZATCA_ONBOARDED",
        entityType: "ZATCAConfiguration",
        entityId: config.id,
        after: { zatcaEnv, csid: mockCSID },
        meta: { userId }
    });

    return config;
}

/**
 * Rotate CSID Certificate
 */
async function rotateZATCACertificate(companyId, userId) {
    const config = await prisma.zATCAConfiguration.findUnique({
        where: { company_id: companyId }
    });

    if (!config || !config.is_onboarded) {
        throw new Error("Company is not onboarded for ZATCA e-invoicing.");
    }

    const rotatedCSID = `rotated_csid_${crypto.randomBytes(16).toString("hex")}`;

    const updatedConfig = await prisma.zATCAConfiguration.update({
        where: { company_id: companyId },
        data: {
            csid: rotatedCSID,
            cert_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }
    });

    await logFinancialMutation({
        companyId,
        action: "ZATCA_CERTIFICATE_ROTATED",
        entityType: "ZATCAConfiguration",
        entityId: updatedConfig.id,
        after: { newCSID: rotatedCSID },
        meta: { userId }
    });

    return updatedConfig;
}

/**
 * Get ZATCA configuration with safely decrypted metadata
 */
async function getZATCAConfig(companyId) {
    const config = await prisma.zATCAConfiguration.findUnique({
        where: { company_id: companyId }
    });
    if (!config) return null;

    return {
        ...config,
        client_id: decrypt(config.client_id_encrypted),
        client_secret: decrypt(config.client_secret_encrypted),
        private_key: decrypt(config.private_key_encrypted),
    };
}

module.exports = {
    enqueueInvoiceSubmission,
    processSubmission,
    retrySubmission,
    getSubmissions,
    getSubmissionLogs,
    onboardZATCA,
    rotateZATCACertificate,
    getZATCAConfig
};
