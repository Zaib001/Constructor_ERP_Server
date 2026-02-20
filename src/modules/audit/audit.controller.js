"use strict";

const prisma = require("../../db");

/**
 * GET /api/audit/logs
 * Paginated query of audit logs. Admin only.
 */
async function getAuditLogs(req, res, next) {
    try {
        const {
            module,
            entity,
            entityId,
            userId,
            action,
            from,
            to,
            page = 1,
            limit = 50,
        } = req.query;

        const where = {};
        if (module) where.module = module;
        if (entity) where.entity = entity;
        if (entityId) where.entity_id = entityId;
        if (userId) where.user_id = userId;
        if (action) where.action = { contains: action, mode: "insensitive" };
        if (from || to) {
            where.created_at = {};
            if (from) where.created_at.gte = new Date(from);
            if (to) where.created_at.lte = new Date(to);
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { created_at: "desc" },
                skip,
                take: Number(limit),
            }),
            prisma.auditLog.count({ where }),
        ]);

        return res.status(200).json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getAuditLogs };
