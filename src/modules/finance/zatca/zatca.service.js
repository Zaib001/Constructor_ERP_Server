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
const forge = require("node-forge");
const axios = require("axios");

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

        // 1. Check for existing active submission (Idempotency Guard)
        let activeSubmission = await prisma.zATCASubmission.findFirst({
            where: {
                invoice_id: invoiceId,
                status: { in: ["QUEUED", "RETRYING", "SUBMITTED"] }
            }
        });

        if (activeSubmission) {
            logger.warn(`[ZATCA Service] Invoice ${invoice.invoice_no} already has an active ZATCA submission in progress. Idempotent return.`);
            return activeSubmission;
        }

        // 2. Create or retrieve existing failed submission
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
    // 1. Optimistic Locking & Duplicate Prevention
    const lockedSub = await prisma.$transaction(async (tx) => {
        // 1. Optimistic Locking: atomically update lock timestamp only if currently null and not accepted/cleared
        const affected = await tx.zATCASubmission.updateMany({
            where: {
                id: submissionId,
                processing_lock_at: null,
                status: { notIn: ["ACCEPTED", "CLEARED"] }
            },
            data: {
                processing_lock_at: new Date(),
                correlation_id: require("../../../utils/context").getContext().correlationId || crypto.randomUUID()
            }
        });

        if (affected.count === 0) {
            // Already locked by another thread or already succeeded
            logger.warn(`[ZATCA Service] Submission ${submissionId} is locked or already cleared. Skipping.`);
            return null;
        }

        // 2. Fetch the locked submission safely
        return await tx.zATCASubmission.findUnique({
            where: { id: submissionId },
            include: {
                company: true,
                invoice: {
                    include: { items: true }
                },
                credit_note: true
            }
        });
    }, { timeout: 25000, maxWait: 15000 });

    if (!lockedSub) return null;

    const { company } = lockedSub;
    let invoice = lockedSub.invoice;

    if (lockedSub.credit_note) {
        const cn = lockedSub.credit_note;
        const totalVal = -Number(cn.amount);
        const taxableVal = Number((totalVal / 1.15).toFixed(2));
        const vatVal = Number((totalVal - taxableVal).toFixed(2));

        invoice = {
            id: cn.invoice_id,
            invoice_no: cn.note_no,
            invoice_date: cn.created_at,
            total_amount: totalVal,
            vat_amount: vatVal,
            subtotal: taxableVal,
            items: [
                {
                    description: cn.reason || "Reversal credit note",
                    quantity: 1,
                    unit_price: taxableVal,
                    subtotal: taxableVal,
                    vat_amount: vatVal
                }
            ]
        };
    }

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
    let realHash = null;

    try {
        // 2. Generate TLV QR Code PNG
        const qrResult = await generateZATCAQR({
            sellerName,
            vatNumber,
            timestamp,
            totalAmount: total,
            vatAmount: vat
        });

        qrBase64 = qrResult.qrBase64DataUrl;
        tlvBase64 = qrResult.tlvBase64;

        // Fetch credentials for Real Digital Signing
        const zatcaConfig = await prisma.zATCAConfiguration.findUnique({ where: { company_id: company.id } });
        let privateKey = null;
        let certPem = null;
        if (zatcaConfig && zatcaConfig.private_key_encrypted && zatcaConfig.certificate_pem) {
            privateKey = decrypt(zatcaConfig.private_key_encrypted);
            certPem = zatcaConfig.certificate_pem;
        }

        // 3. Build complete UBL XML & gateway request payload (Now with ECDSA Signature)
        const payload = buildZATCAPayload(invoice, company, qrBase64, lockedSub.zatca_uuid, privateKey, certPem);
        realHash = payload.invoiceHash;

        // 4. Update status to SUBMITTED before API call
        await prisma.zATCASubmission.update({
            where: { id: submissionId },
            data: { status: "SUBMITTED" }
        });

        // 5. Submit to ZATCA Phase 2 compliant Gateway
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

    // 6. Retry Handling
    let nextRetry = null;
    let finalStatus = statusAfter;

    if (statusAfter === "FAILED" || statusAfter === "REJECTED") {
        const retryLimit = parseInt(process.env.ZATCA_RETRY_LIMIT) || 3;
        if (lockedSub.retry_count < retryLimit) {
            finalStatus = "RETRYING";
            const backoffMinutes = Math.pow(2, lockedSub.retry_count + 1);
            nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000);
            logger.info(`[ZATCA Service] Submission ${submissionId} failed. Retry enqueued in ${backoffMinutes} min.`);
        } else {
            finalStatus = "FAILED";
            logger.warn(`[ZATCA Service] Submission ${submissionId} reached maximum retry limit.`);
        }
    }

    // 7. Persist status, release the processing lock, and store computed invoice hash
    const updatedSub = await prisma.zATCASubmission.update({
        where: { id: submissionId },
        data: {
            status:          finalStatus,
            qr_code_base64:  tlvBase64,
            invoice_hash:    realHash,
            zatca_response:  gatewayResponse || undefined,
            error_message:   errMsg,
            retry_count:     finalStatus === "RETRYING" ? { increment: 1 } : undefined,
            next_retry_at:   nextRetry,
            submitted_at:    new Date(),
            accepted_at:     finalStatus === "ACCEPTED" || finalStatus === "CLEARED" ? new Date() : undefined,
            rejected_at:     finalStatus === "REJECTED" ? new Date() : undefined,
            cleared_at:      finalStatus === "CLEARED" ? new Date() : undefined,
            processing_lock_at: null // Release lock
        }
    });

    // 8. Sync back to ClientInvoice table
    await prisma.clientInvoice.update({
        where: { id: invoice.id },
        data: {
            zatca_status:   finalStatus,
            zatca_qr_code:  qrBase64
        }
    });

    // 9. Immutable Event Logging
    await prisma.zATCAEventLog.create({
        data: {
            company_id:       company.id,
            submission_id:    submissionId,
            event_type:       finalStatus,
            status_before:    lockedSub.status,
            status_after:     finalStatus,
            error_details:    errMsg,
            retry_count:      updatedSub.retry_count,
            triggered_by:     "worker",
            request_payload:  { invoice_no: invoice.invoice_no, total, vat },
            response_payload: gatewayResponse || undefined
        }
    });

    // 10. Auditing
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
 * Enqueue a Credit Note for ZATCA e-Invoicing submission.
 * Triggered asynchronously immediately after a credit note is successfully POSTED.
 */
async function enqueueCreditNoteSubmission(creditNoteId, companyId, userId) {
    try {
        const creditNote = await prisma.creditNote.findFirst({
            where: { id: creditNoteId, company_id: companyId }
        });

        if (!creditNote) throw new Error(`Credit Note with ID ${creditNoteId} not found.`);
        if (creditNote.status !== "posted") {
            throw new Error(`Only posted credit notes can be submitted to ZATCA. Current status: ${creditNote.status}`);
        }

        const xmlUUID = crypto.randomUUID();

        // Create submission record linked to the credit note and the original invoice
        const submission = await prisma.zATCASubmission.create({
            data: {
                company_id: companyId,
                invoice_id: creditNote.invoice_id,
                credit_note_id: creditNoteId,
                status:     "QUEUED",
                zatca_uuid: xmlUUID,
                retry_count: 0,
                next_retry_at: new Date()
            }
        });

        // Write ZATCA Event Log
        await prisma.zATCAEventLog.create({
            data: {
                company_id:    companyId,
                submission_id: submission.id,
                event_type:    "QUEUED",
                status_before: "NOT_QUEUED",
                status_after:  "QUEUED",
                triggered_by:  "api"
            }
        });

        logger.info(`[ZATCA Service] Credit Note ${creditNote.note_no} enqueued for submission.`);
        return submission;
    } catch (err) {
        logger.error("[ZATCA Service] Failed to enqueue credit note", { creditNoteId, err: err.message });
        throw err;
    }
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
 * Generates CSR and retrieves CCSID/PCSID dynamically based on real gateway APIs.
 */
async function onboardZATCA(companyId, { zatcaEnv, otp }, userId) {
    // 1. Generate real ECDSA secp256k1 key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'sec1', format: 'pem' }
    });

    const encryptedPrivateKey = encrypt(privateKey);

    const company = await prisma.company.findUnique({ where: { id: companyId }});
    if (!company) throw new Error("Company not found");

    const orgName = company.name || "Default Org";
    const vatNumber = company.vat_number || process.env.ZATCA_VAT_NUMBER || "311111111101113";
    
    // ZATCA specific CSR generation using node-forge
    const forgePrivateKey = forge.pki.privateKeyFromPem(privateKey);
    const forgePublicKey = forge.pki.publicKeyFromPem(publicKey);
    
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = forgePublicKey;
    
    csr.setSubject([
        { name: 'countryName', value: 'SA' },
        { name: 'organizationName', value: orgName },
        { name: 'organizationalUnitName', value: 'Riyadh Branch' },
        { name: 'commonName', value: `TST-${vatNumber}` },
        { shortName: 'SN', value: `1-TST|2-TST|3-ed22f1d8-e6a2-1118-9b58-d9a8f11e445f` },
        { shortName: 'UID', value: vatNumber },
        { shortName: 'title', value: '1100' },
        { shortName: 'registeredAddress', value: company.address || 'Riyadh' },
        { shortName: 'businessCategory', value: 'Construction' }
    ]);
    
    csr.sign(forgePrivateKey, forge.md.sha256.create());
    const csrPem = forge.pki.certificationRequestToPem(csr);
    const csrBase64 = Buffer.from(csrPem).toString('base64');

    let certificatePem = "";
    let ccsid = "";
    let pcsid = "";
    let clientSecret = "";

    // Simulation allowed ONLY in dev config
    if (zatcaEnv === "simulation") {
        if (process.env.NODE_ENV !== "development" || process.env.ALLOW_SIMULATION !== "true") {
            throw new Error("Simulation mode is strictly blocked in this environment.");
        }
        logger.info(`[ZATCA Service] [SIMULATION] Generating mock onboarding credentials for testing.`);
        certificatePem = `-----BEGIN CERTIFICATE-----\nMIIB7TCCAZegAwIBAgIU...\n-----END CERTIFICATE-----`;
        ccsid = `ccsid_${crypto.randomBytes(16).toString("hex")}`;
        pcsid = `pcsid_${crypto.randomBytes(16).toString("hex")}`;
        clientSecret = `secret_${crypto.randomBytes(16).toString("hex")}`;
    } else {
        if (!otp) throw new Error("OTP is required for real ZATCA onboarding.");
        
        const baseUrl = zatcaEnv === "production" ? "https://gw-fatoora.zatca.gov.sa/e-invoicing/core" : "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal";
        
        try {
            logger.info(`[ZATCA Service] Requesting CCSID from ${baseUrl}/compliance...`);
            // 1. Get CCSID (Compliance CSID)
            const ccsidRes = await axios.post(`${baseUrl}/compliance`, { csr: csrBase64 }, {
                headers: { 'OTP': otp, 'Accept-Version': 'V2', 'Content-Type': 'application/json' }
            });

            ccsid = ccsidRes.data.binarySecurityToken;
            clientSecret = ccsidRes.data.secret;

            logger.info(`[ZATCA Service] CCSID retrieved. Requesting PCSID...`);

            // 2. Get PCSID (Production CSID)
            const pcsidRes = await axios.post(`${baseUrl}/production/csids`, { compliance_request_id: ccsidRes.data.requestID }, {
                headers: { 
                    'Authorization': `Basic ${Buffer.from(ccsid + ":" + clientSecret).toString('base64')}`,
                    'Accept-Version': 'V2',
                    'Content-Type': 'application/json'
                }
            });

            pcsid = pcsidRes.data.binarySecurityToken;
            certificatePem = pcsidRes.data.binarySecurityToken; // PCSID itself acts as the public cert
            
            logger.info(`[ZATCA Service] Successfully retrieved PCSID and completed ZATCA Compliance onboarding.`);
        } catch (err) {
            logger.error(`[ZATCA API] Real Compliance API failed: ${err.message}`);
            throw new Error(`ZATCA Compliance Gateway Error: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
        }
    }

    const encryptedClientSecret = encrypt(clientSecret);
    const finalEnv = zatcaEnv || "simulation";
    
    const config = await prisma.zATCAConfiguration.upsert({
        where: { company_id: companyId },
        update: {
            zatca_env: finalEnv,
            client_id_encrypted: encrypt("clientId_not_used_in_v2"),
            client_secret_encrypted: encryptedClientSecret,
            certificate_pem: certificatePem,
            private_key_encrypted: encryptedPrivateKey,
            csid: ccsid,
            pcsid: pcsid,
            is_onboarded: true,
            cert_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        },
        create: {
            company_id: companyId,
            zatca_env: finalEnv,
            client_id_encrypted: encrypt("clientId_not_used_in_v2"),
            client_secret_encrypted: encryptedClientSecret,
            certificate_pem: certificatePem,
            private_key_encrypted: encryptedPrivateKey,
            csid: ccsid,
            pcsid: pcsid,
            is_onboarded: true,
            cert_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }
    });

    await logFinancialMutation({
        companyId,
        action: "ZATCA_ONBOARDED",
        entityType: "ZATCAConfiguration",
        entityId: config.id,
        after: { zatcaEnv: finalEnv, ccsid: "REDACTED", pcsid: "REDACTED" },
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
    enqueueCreditNoteSubmission,
    processSubmission,
    retrySubmission,
    getSubmissions,
    getSubmissionLogs,
    onboardZATCA,
    rotateZATCACertificate,
    getZATCAConfig
};
