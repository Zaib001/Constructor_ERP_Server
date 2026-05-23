"use strict";

const express = require("express");
const multer = require("multer");
const router = express.Router();
const ctrl = require("./dms.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

router.use(authenticateJWT);

router.get("/", ctrl.list);
router.get("/:id", ctrl.getById);
router.post("/upload", upload.single("file"), ctrl.upload);
router.post("/:id/versions", upload.single("file"), ctrl.uploadVersion);
router.patch("/versions/:versionId/approve", ctrl.approveVersion);
router.patch("/versions/:versionId/reject", ctrl.rejectVersion);
router.patch("/versions/:versionId/publish", ctrl.publishVersion);
router.get("/versions/:versionId/download", ctrl.download);

module.exports = router;
