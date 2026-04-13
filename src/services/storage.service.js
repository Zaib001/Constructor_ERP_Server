"use strict";

const fs = require("fs");
const path = require("path");
const logger = require("../logger");

/**
 * Storage Service Skeleton
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides a unified interface for file storage operations.
 * Initial implementation uses local file system (uploads/ folder).
 * Can be extended to support AWS S3, Azure Blob, etc.
 */

const UPLOAD_DIR = path.join(__dirname, "../../uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    logger.info(`StorageService: Created local upload directory at ${UPLOAD_DIR}`);
}

/**
 * Upload a file to local storage.
 * @param {Buffer} fileBuffer - The file content
 * @param {string} fileName - Original file name
 * @param {string} folder - Subfolder within uploads/
 * @returns {Promise<Object>} - { key, url }
 */
async function uploadFile(fileBuffer, fileName, folder = "general") {
    try {
        const timestamp = Date.now();
        const safeName = fileName.replace(/[^a-z0-9.]/gi, "_").toLowerCase();
        const key = `${folder}/${timestamp}_${safeName}`;
        const filePath = path.join(UPLOAD_DIR, key);

        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, fileBuffer);

        logger.info(`StorageService: File uploaded successfully: ${key}`);

        return {
            key,
            url: `/uploads/${key}`, // Relative URL for frontend exposure
            path: filePath
        };
    } catch (err) {
        logger.error("StorageService: Upload failed", { error: err.message, fileName });
        throw new Error("File upload failed");
    }
}

/**
 * Get file metadata or read file.
 * @param {string} key - File key (path within uploads/)
 */
async function getFile(key) {
    const filePath = path.join(UPLOAD_DIR, key);
    if (!fs.existsSync(filePath)) {
        throw new Error("File not found");
    }
    return fs.readFileSync(filePath);
}

/**
 * Delete a file.
 * @param {string} key - File key
 */
async function deleteFile(key) {
    try {
        const filePath = path.join(UPLOAD_DIR, key);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info(`StorageService: File deleted: ${key}`);
        }
    } catch (err) {
        logger.error("StorageService: Delete failed", { error: err.message, key });
    }
}

module.exports = {
    uploadFile,
    getFile,
    deleteFile
};
