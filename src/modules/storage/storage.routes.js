"use strict";

const express = require("express");
const multer = require("multer");
const storageController = require("./storage.controller");
const authMiddleware = require("../../middleware/authenticateJWT");

const router = express.Router();

// Configure multer to use memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

/**
 * @route POST /api/storage/upload
 * @desc  Upload a file to the system
 * @access Private
 */
router.post("/upload", authMiddleware, upload.single("file"), storageController.uploadFile);

/**
 * @route DELETE /api/storage/delete
 * @desc  Delete a file from the system
 * @access Private
 */
router.delete("/delete", authMiddleware, storageController.deleteFile);

module.exports = router;
