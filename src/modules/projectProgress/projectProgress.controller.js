"use strict";

const progressService = require("./projectProgress.service");
const logger = require("../../logger");

async function createProgress(req, res, next) {
    try {
        const progress = await progressService.createProgress(req.body, req.user, req.user.id);
        return res.status(201).json({ success: true, data: progress });
    } catch (err) {
        logger.error("Error in createProgress:", err);
        next(err);
    }
}

async function getProgressByProject(req, res, next) {
    try {
        const progress = await progressService.getProgressByProject(req.params.projectId, req.user);
        return res.status(200).json({ success: true, data: progress });
    } catch (err) {
        logger.error("Error in getProgressByProject:", err);
        next(err);
    }
}

module.exports = { createProgress, getProgressByProject };
