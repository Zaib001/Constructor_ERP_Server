"use strict";

const vendorsService = require("./vendors.service");
const logger = require("../../logger");

async function getAllVendors(req, res, next) {
    try {
        const { page, pageSize } = req.query;
        const p = parseInt(page) || 1;
        const ps = parseInt(pageSize) || 50;

        const result = await vendorsService.getAllVendors(req.user, p, ps);
        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        logger.error("Error in getAllVendors:", err);
        next(err);
    }
}

async function getVendorById(req, res, next) {
    try {
        const vendor = await vendorsService.getVendorById(req.params.id, req.user);
        if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found or access denied" });
        return res.status(200).json({ success: true, data: vendor });
    } catch (err) {
        logger.error("Error in getVendorById:", err);
        next(err);
    }
}

async function createVendor(req, res, next) {
    try {
        const vendor = await vendorsService.createVendor(req.body, req.user);
        return res.status(201).json({ success: true, data: vendor });
    } catch (err) {
        logger.error("Error in createVendor:", err);
        next(err);
    }
}

async function updateVendor(req, res, next) {
    try {
        const vendor = await vendorsService.updateVendor(req.params.id, req.body, req.user);
        return res.status(200).json({ success: true, data: vendor });
    } catch (err) {
        logger.error("Error in updateVendor:", err);
        next(err);
    }
}

async function suspendVendor(req, res, next) {
    try {
        const vendor = await vendorsService.suspendVendor(req.params.id, req.user);
        return res.status(200).json({ success: true, data: vendor });
    } catch (err) {
        logger.error("Error in suspendVendor:", err);
        next(err);
    }
}

async function deactivateVendor(req, res, next) {
    try {
        const vendor = await vendorsService.deactivateVendor(req.params.id, req.user);
        return res.status(200).json({ success: true, data: vendor });
    } catch (err) {
        logger.error("Error in deactivateVendor:", err);
        next(err);
    }
}

async function deleteVendor(req, res, next) {
    try {
        await vendorsService.deleteVendor(req.params.id, req.user);
        return res.status(200).json({ success: true, message: "Vendor archived successfully" });
    } catch (err) {
        logger.error("Error in deleteVendor:", err);
        next(err);
    }
}

async function approveVendor(req, res, next) {
    try {
        const vendor = await vendorsService.approveVendor(req.params.id, req.user);
        return res.status(200).json({ success: true, data: vendor });
    } catch (err) {
        logger.error("Error in approveVendor:", err);
        next(err);
    }
}

module.exports = { 
    getAllVendors, 
    getVendorById, 
    createVendor, 
    updateVendor, 
    deleteVendor,
    suspendVendor,
    deactivateVendor,
    approveVendor
};
