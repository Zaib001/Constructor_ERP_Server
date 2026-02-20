"use strict";

const projectAccessService = require("./projectAccess.service");

function getIp(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || req.ip || null;
}
function getDevice(req) {
    return req.headers["user-agent"] || null;
}

// ─── Assign Access ────────────────────────────────────────────────────────────

async function assignAccess(req, res, next) {
    try {
        const result = await projectAccessService.assignAccess(
            req.body,
            req.user.userId,
            getIp(req),
            getDevice(req)
        );
        return res.status(201).json({
            success: true,
            message: "Project access assigned successfully",
            data: result,
        });
    } catch (err) { next(err); }
}

// ─── Update Access ────────────────────────────────────────────────────────────

async function updateAccess(req, res, next) {
    try {
        const result = await projectAccessService.updateAccess(
            req.params.id,
            req.body.accessType,
            req.user.userId,
            getIp(req),
            getDevice(req)
        );
        return res.status(200).json({
            success: true,
            message: "Access level updated successfully",
            data: result,
        });
    } catch (err) { next(err); }
}

// ─── Revoke Access ────────────────────────────────────────────────────────────

async function revokeAccess(req, res, next) {
    try {
        await projectAccessService.revokeAccess(
            req.params.id,
            req.user.userId,
            getIp(req),
            getDevice(req)
        );
        return res.status(200).json({
            success: true,
            message: "Project access revoked successfully",
        });
    } catch (err) { next(err); }
}

// ─── Get User's Projects ──────────────────────────────────────────────────────

async function getUserProjects(req, res, next) {
    try {
        const result = await projectAccessService.getUserProjects(req.params.userId);
        return res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
}

// ─── Get Project's Users ──────────────────────────────────────────────────────

async function getProjectUsers(req, res, next) {
    try {
        const result = await projectAccessService.getProjectUsers(req.params.projectId);
        return res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
}

async function getAllAssignments(req, res, next) {
    try {
        const result = await projectAccessService.getAllAssignments();
        return res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
}

async function getAllProjects(req, res, next) {
    try {
        const result = await projectAccessService.getAllProjects();
        return res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
}

module.exports = { assignAccess, updateAccess, revokeAccess, getUserProjects, getProjectUsers, getAllAssignments, getAllProjects };
