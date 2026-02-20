"use strict";

const { logSystem } = require("./systemLogs.service");

/**
 * GET /api/system/logs
 * Query system logs with optional filters. Admin only.
 */
async function getSystemLogs(req, res, next) {
    try {
        const prisma = require("../../db");
        const { level, from, to, page = 1, limit = 50 } = req.query;

        const where = {};
        if (level) where.level = level;
        if (from || to) {
            where.created_at = {};
            if (from) where.created_at.gte = new Date(from);
            if (to) where.created_at.lte = new Date(to);
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [logs, total] = await Promise.all([
            prisma.systemLog.findMany({
                where,
                orderBy: { created_at: "desc" },
                skip,
                take: Number(limit),
            }),
            prisma.systemLog.count({ where }),
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

module.exports = { getSystemLogs };
