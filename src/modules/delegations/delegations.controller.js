"use strict";

const service = require("./delegations.service");
const { validate } = require("../../middleware/validate.middleware");
const { CreateDelegationSchema } = require("./delegations.validator");

// ─── POST /api/delegations ────────────────────────────────────────────────────

async function createDelegation(req, res, next) {
    try {
        const { fromUser, toUser, startDate, endDate } = req.validated || req.body;
        const { userId: actorId } = req.user;
        const { ipAddress, deviceInfo } = req.context || {};

        const delegation = await service.createDelegation(
            { fromUser, toUser, startDate, endDate },
            actorId, ipAddress, deviceInfo
        );

        return res.status(201).json({
            success: true,
            message: "Delegation created successfully",
            data: delegation,
        });
    } catch (err) {
        next(err);
    }
}

// ─── GET /api/delegations ─────────────────────────────────────────────────────

async function getDelegations(req, res, next) {
    try {
        const { userId, active } = req.query;
        const delegations = await service.getDelegations({ userId, active });

        return res.status(200).json({
            success: true,
            message: "Delegations retrieved",
            data: delegations,
        });
    } catch (err) {
        next(err);
    }
}

// ─── PATCH /api/delegations/:id/disable ──────────────────────────────────────

async function disableDelegation(req, res, next) {
    try {
        const { id } = req.params;
        const { userId: actorId } = req.user;
        const { ipAddress, deviceInfo } = req.context || {};

        const updated = await service.disableDelegation(id, actorId, ipAddress, deviceInfo);

        return res.status(200).json({
            success: true,
            message: "Delegation disabled",
            data: updated,
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { createDelegation, getDelegations, disableDelegation };
