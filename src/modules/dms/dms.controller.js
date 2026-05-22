"use strict";

const fs = require("fs");
const service = require("./dms.service");

async function list(req, res, next) {
    try {
        const result = await service.listDocuments(req.user.companyId, req.query);
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
}

async function getById(req, res, next) {
    try {
        const data = await service.getDocumentById(req.params.id, req.user.companyId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function upload(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
        const result = await service.uploadDocument(req.file.buffer, req.file, req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
}

async function uploadVersion(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
        const data = await service.uploadVersion(req.params.id, req.file.buffer, req.file, req.body, req.user);
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
}

async function approveVersion(req, res, next) {
    try {
        const data = await service.approveVersion(
            req.params.versionId, req.user.companyId, req.user.userId, req.body.reason
        );
        res.json({ success: true, data, message: "Version approved." });
    } catch (err) { next(err); }
}

async function rejectVersion(req, res, next) {
    try {
        const data = await service.rejectVersion(
            req.params.versionId, req.user.companyId, req.user.userId, req.body.reason
        );
        res.json({ success: true, data, message: "Version rejected." });
    } catch (err) { next(err); }
}

async function publishVersion(req, res, next) {
    try {
        const data = await service.publishVersion(req.params.versionId, req.user.companyId);
        res.json({ success: true, data, message: "Version published." });
    } catch (err) { next(err); }
}

async function download(req, res, next) {
    try {
        const version = await service.downloadDocument(
            req.params.versionId, req.user.companyId, req.user.userId, req.ip
        );
        const filePath = version.storage_path;
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: "File not found on disk." });
        }
        res.download(filePath, version.original_filename);
    } catch (err) { next(err); }
}

module.exports = { list, getById, upload, uploadVersion, approveVersion, rejectVersion, publishVersion, download };
