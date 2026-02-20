"use strict";

const service = require("./approvals.service");

function getIp(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || req.ip || null;
}
function getDevice(req) {
    return req.headers["user-agent"] || null;
}

// POST /api/approvals/request
async function requestApproval(req, res, next) {
    try {
        const result = await service.requestApproval(req.body, req.user.userId, getIp(req), getDevice(req));
        return res.status(201).json({ success: true, message: "Approval request created", data: result });
    } catch (err) { next(err); }
}

// GET /api/approvals/inbox
async function getInbox(req, res, next) {
    try {
        const items = await service.getInbox(req.user.userId, req.query.status);
        return res.status(200).json({ success: true, count: items.length, data: items });
    } catch (err) { next(err); }
}

// POST /api/approvals/:id/approve
async function approveStep(req, res, next) {
    try {
        const result = await service.approveStep(req.params.id, req.user.userId, req.body.remarks, getIp(req), getDevice(req));
        return res.status(200).json({ success: true, message: "Step approved", data: result });
    } catch (err) { next(err); }
}

// POST /api/approvals/:id/reject
async function rejectStep(req, res, next) {
    try {
        const result = await service.rejectStep(req.params.id, req.user.userId, req.body.remarks, getIp(req), getDevice(req));
        return res.status(200).json({ success: true, message: "Approval rejected", data: result });
    } catch (err) { next(err); }
}

// GET /api/approvals/history?docType=PO&docId=uuid
async function getHistory(req, res, next) {
    try {
        const records = await service.getHistory(req.query.docType, req.query.docId);
        return res.status(200).json({ success: true, data: records });
    } catch (err) { next(err); }
}

// GET /api/approvals/:id
async function getRequest(req, res, next) {
    try {
        const result = await service.getRequestById(req.params.id);
        return res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
}

// POST /api/approvals/:id/cancel
async function cancelApproval(req, res, next) {
    try {
        const result = await service.cancelApproval(req.params.id, req.user.userId, getIp(req), getDevice(req));
        return res.status(200).json({ success: true, message: "Approval cancelled", data: result });
    } catch (err) { next(err); }
}

module.exports = { requestApproval, getInbox, approveStep, rejectStep, getHistory, cancelApproval, getRequest };
