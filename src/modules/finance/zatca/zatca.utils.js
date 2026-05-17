"use strict";

const crypto = require("crypto");

// Resolve a secure key from JWT_SECRET or a fallback
const ENCRYPTION_KEY = process.env.ZATCA_ENCRYPTION_KEY || process.env.JWT_SECRET || "hoopoees_keyzite_zatca_secret_key_32";

/**
 * Derives a valid 32-byte key from a variable-length string
 */
function getDerivedKey() {
    return crypto.createHash("sha256").update(String(ENCRYPTION_KEY)).digest();
}

/**
 * Encrypt a plain-text credential (private key, client secret) using AES-256-GCM
 */
function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(12); // Standard 12-byte IV for GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", getDerivedKey(), iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag(); // Retrieve authentication tag for integrity
    return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt an encrypted credential, supporting GCM and CBC fallback
 */
function decrypt(text) {
    if (!text) return null;
    try {
        const parts = text.split(":");
        if (parts.length === 3) {
            // Decrypt GCM (iv:tag:ciphertextHex)
            const iv = Buffer.from(parts[0], "hex");
            const tag = Buffer.from(parts[1], "hex");
            const encryptedHex = parts[2];
            const decipher = crypto.createDecipheriv("aes-256-gcm", getDerivedKey(), iv);
            decipher.setAuthTag(tag);
            let decrypted = decipher.update(encryptedHex, "hex", "utf8");
            decrypted += decipher.final("utf8");
            return decrypted;
        } else if (parts.length === 2) {
            // Fallback: Decrypt CBC (iv:ciphertextHex)
            const iv = Buffer.from(parts[0], "hex");
            const encryptedHex = parts[1];
            const decipher = crypto.createDecipheriv("aes-256-cbc", getDerivedKey(), iv);
            let decrypted = decipher.update(encryptedHex, "hex", "utf8");
            decrypted += decipher.final("utf8");
            return decrypted;
        }
        return text;
    } catch (err) {
        // Fallback to raw text if it wasn't encrypted
        return text;
    }
}

module.exports = { encrypt, decrypt };

