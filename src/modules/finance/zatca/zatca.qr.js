"use strict";

/**
 * zatca.qr.js — ZATCA Phase 2 TLV QR Code Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements ZATCA's 5-tag TLV (Tag-Length-Value) encoding spec exactly.
 * Output: base64-encoded TLV buffer → rendered as QR PNG via qrcode library.
 *
 * ZATCA Phase 2 mandatory tags:
 *   Tag 1: Seller Name
 *   Tag 2: VAT Registration Number
 *   Tag 3: Timestamp (ISO 8601)
 *   Tag 4: Invoice Total (incl. VAT), 2 decimal places
 *   Tag 5: VAT Total, 2 decimal places
 */

const QRCode = require("qrcode");

/**
 * Encode a single TLV field into a Buffer.
 */
function encodeTLVField(tag, value) {
    const valueBuffer = Buffer.from(value, "utf8");
    const tlvBuffer   = Buffer.alloc(2 + valueBuffer.length);
    tlvBuffer.writeUInt8(tag,               0);
    tlvBuffer.writeUInt8(valueBuffer.length, 1);
    valueBuffer.copy(tlvBuffer, 2);
    return tlvBuffer;
}

/**
 * Build ZATCA-compliant TLV payload from invoice data.
 * @param {object} p
 * @param {string}  p.sellerName  - Company name (must match ZATCA registration)
 * @param {string}  p.vatNumber   - 15-digit VAT registration number
 * @param {string}  p.timestamp   - ISO 8601 date-time
 * @param {number}  p.totalAmount - Invoice total including VAT
 * @param {number}  p.vatAmount   - VAT portion only
 * @returns {string} Base64-encoded TLV string
 */
function buildTLVPayload({ sellerName, vatNumber, timestamp, totalAmount, vatAmount }) {
    const fields = [
        encodeTLVField(1, sellerName),
        encodeTLVField(2, vatNumber),
        encodeTLVField(3, timestamp),
        encodeTLVField(4, Number(totalAmount).toFixed(2)),
        encodeTLVField(5, Number(vatAmount).toFixed(2)),
    ];
    return Buffer.concat(fields).toString("base64");
}

/**
 * Generate a ZATCA-compliant QR code PNG as base64 data URL.
 * @param {object} invoiceData - Same fields as buildTLVPayload
 * @returns {Promise<{ qrBase64DataUrl: string, tlvBase64: string }>}
 */
async function generateZATCAQR(invoiceData) {
    const tlvBase64 = buildTLVPayload(invoiceData);

    const qrBase64DataUrl = await QRCode.toDataURL(tlvBase64, {
        errorCorrectionLevel: "M",
        type:    "image/png",
        margin:  1,
        width:   300,
        color:   { dark: "#000000", light: "#FFFFFF" },
    });

    return { qrBase64DataUrl, tlvBase64 };
}

module.exports = { buildTLVPayload, generateZATCAQR };
