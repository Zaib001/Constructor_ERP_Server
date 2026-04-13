"use strict";

const storageService = require("../../services/storage.service");
const logger = require("../../logger");

/**
 * Handle multipart file upload.
 */
async function uploadFile(req, res, next) {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file was provided in the request"
            });
        }

        const folder = req.body.folder || "general";

        // storageService.uploadFile expects (buffer, fileName, folder)
        const result = await storageService.uploadFile(
            req.file.buffer,
            req.file.originalname,
            folder
        );

        return res.status(200).json({
            success: true,
            message: "File uploaded successfully",
            data: {
                key: result.key,
                url: result.url
            }
        });
    } catch (err) {
        logger.error("StorageController: Upload failed", err);
        next(err);
    }
}

/**
 * Handle file deletion.
 */
async function deleteFile(req, res, next) {
    try {
        const { key } = req.body;
        if (!key) {
            return res.status(400).json({
                success: false,
                message: "File key is required for deletion"
            });
        }

        await storageService.deleteFile(key);

        return res.status(200).json({
            success: true,
            message: "File deletion processed"
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    uploadFile,
    deleteFile
};
