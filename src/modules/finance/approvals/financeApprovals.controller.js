"use strict";

const service = require("./financeApprovals.service");
const logger = require("../../../logger");

async function getPendingApprovals(req, res, next) {
    try {
        const { type } = req.query;
        if (type && type !== "vendor" && type !== "rfq") {
            return res.status(400).json({
                success: false,
                message: "Invalid type query parameter. Must be 'vendor' or 'rfq'."
            });
        }

        const data = await service.getPendingApprovals(req.user, type);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        logger.error("Error in getPendingApprovals:", err);
        next(err);
    }
}

async function actionVendorApproval(req, res, next) {
    try {
        const { id } = req.params;
        const { action, remarks } = req.body;

        if (!action || !["approve", "reject"].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Missing or invalid action field. Must be 'approve' or 'reject'."
            });
        }

        if (action === "reject" && (!remarks || !remarks.trim())) {
            return res.status(400).json({
                success: false,
                message: "Remarks (rejection reason) are mandatory for rejecting."
            });
        }

        const ipAddress = req.ip || req.connection.remoteAddress;
        const deviceInfo = req.headers["user-agent"] || "unknown";

        const result = await service.actionVendorApproval(id, action, remarks, req.user, ipAddress, deviceInfo);
        return res.status(200).json({
            success: true,
            message: `Vendor registration successfully ${action}d.`,
            data: result
        });
    } catch (err) {
        logger.error("Error in actionVendorApproval:", err);
        next(err);
    }
}

async function actionRfqApproval(req, res, next) {
    try {
        const { id } = req.params;
        const { action, remarks } = req.body;

        if (!action || !["approve", "reject"].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Missing or invalid action field. Must be 'approve' or 'reject'."
            });
        }

        if (action === "reject" && (!remarks || !remarks.trim())) {
            return res.status(400).json({
                success: false,
                message: "Remarks (rejection reason) are mandatory for rejecting."
            });
        }

        const ipAddress = req.ip || req.connection.remoteAddress;
        const deviceInfo = req.headers["user-agent"] || "unknown";

        const result = await service.actionRfqApproval(id, action, remarks, req.user, ipAddress, deviceInfo);
        return res.status(200).json({
            success: true,
            message: `RFQ comparison successfully ${action}d.`,
            data: result
        });
    } catch (err) {
        logger.error("Error in actionRfqApproval:", err);
        next(err);
    }
}

module.exports = {
    getPendingApprovals,
    actionVendorApproval,
    actionRfqApproval
};
