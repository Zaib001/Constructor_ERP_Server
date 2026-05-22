"use strict";

const service = require("./assets.service");

async function list(req, res, next) {
    try {
        const result = await service.listAssets(req.user.companyId, req.query);
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
}

async function getById(req, res, next) {
    try {
        const data = await service.getAssetById(req.params.id, req.user.companyId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const data = await service.createAsset(req.body, req.user);
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
}

async function approve(req, res, next) {
    try {
        const data = await service.approveAsset(req.params.id, req.user.companyId, req.user.userId);
        res.json({ success: true, data, message: "Asset approved and GL posted." });
    } catch (err) { next(err); }
}

async function allocate(req, res, next) {
    try {
        const data = await service.allocateAsset(req.params.id, req.user.companyId, req.body, req.user.userId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function depreciate(req, res, next) {
    try {
        const { period_month } = req.body;
        if (!period_month) return res.status(400).json({ success: false, message: "period_month is required (YYYY-MM)" });
        const result = await service.runDepreciation(req.user.companyId, period_month, req.user.userId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

async function dispose(req, res, next) {
    try {
        const data = await service.disposeAsset(req.params.id, req.user.companyId, req.body, req.user.userId);
        res.json({ success: true, data, message: "Asset disposed and GL reconciled." });
    } catch (err) { next(err); }
}

module.exports = { list, getById, create, approve, allocate, depreciate, dispose };
