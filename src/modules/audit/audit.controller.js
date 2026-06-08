"use strict";

const prisma = require("../../db");

/**
 * GET /api/audit/logs
 * Extended for Feature 3 spec:
 *   - ?userId, ?actionType, ?entity, ?from, ?to, ?search, ?page, ?limit, ?format=csv
 * Returns enriched logs with user details joined in JS.
 */
async function getAuditLogs(req, res, next) {
    try {
        const {
            userId,
            actionType,
            entity,
            from,
            to,
            search,
            format,
            page  = 1,
            limit = 50,
        } = req.query;

        // Validate date params
        if (from && isNaN(Date.parse(from))) {
            return res.status(400).json({ success: false, message: "Invalid 'from' date." });
        }
        if (to && isNaN(Date.parse(to))) {
            return res.status(400).json({ success: false, message: "Invalid 'to' date." });
        }

        const maxLimit = format === "csv" ? 200 : 200;
        const pageNum  = Math.max(1, Number(page));
        const pageSize = Math.min(maxLimit, Number(limit) || 50);
        const skip     = (pageNum - 1) * pageSize;

        const where = {};
        if (userId)     where.user_id = userId;
        if (actionType) where.action  = { contains: actionType, mode: "insensitive" };
        if (entity)     where.entity  = { contains: entity,     mode: "insensitive" };
        if (search)     where.action  = { contains: search,     mode: "insensitive" };
        if (from || to) {
            where.created_at = {
                ...(from && { gte: new Date(from) }),
                ...(to   && { lte: new Date(to) }),
            };
        }

        const [rawLogs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { created_at: "desc" },
                skip,
                take: pageSize,
            }),
            prisma.auditLog.count({ where }),
        ]);

        // Enrich logs with user info (batch lookup)
        const userIds = [...new Set(rawLogs.map((l) => l.user_id).filter(Boolean))];
        const users   = userIds.length
            ? await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, email: true, roles: { select: { code: true, name: true } } },
              })
            : [];
        const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

        const logs = rawLogs.map((l) => {
            const u = userMap[l.user_id];
            return {
                id:         l.id,
                timestamp:  l.created_at,
                user:       u ? {
                    id:    u.id,
                    name:  u.name,
                    email: u.email,
                    role:  u.roles?.code?.toUpperCase() || "UNKNOWN",
                } : null,
                actionType: (l.action || "").toUpperCase(),
                entity:     (l.entity || "").toUpperCase(),
                entityId:   l.entity_id,
                description: buildDescription(l),
                metadata:   {
                    module:     l.module,
                    beforeData: l.before_data,
                    afterData:  l.after_data,
                    ipAddress:  l.ip_address,
                },
                ipAddress:  l.ip_address,
                platform:   detectPlatform(l.device_info),
            };
        });

        // CSV export
        if (format === "csv") {
            const rows = [
                ["Timestamp","User","Email","Role","Action","Entity","EntityId","Description","IP"].join(","),
                ...logs.map((l) => [
                    l.timestamp, l.user?.name || "", l.user?.email || "", l.user?.role || "",
                    l.actionType, l.entity, l.entityId || "", `"${(l.description||"").replace(/"/g,'""')}"`,
                    l.ipAddress || "",
                ].join(",")),
            ];
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", "attachment; filename=audit-logs.csv");
            return res.send(rows.join("\n"));
        }

        return res.status(200).json({
            success: true,
            total,
            page:  pageNum,
            limit: pageSize,
            logs,
        });
    } catch (err) {
        next(err);
    }
}

function buildDescription(log) {
    const parts = [log.action, log.entity, log.entity_id ? `#${log.entity_id.slice(0,8)}` : ""].filter(Boolean);
    return parts.join(" ").trim() || "System event";
}

function detectPlatform(userAgent) {
    if (!userAgent) return "WEB";
    const ua = userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) return "MOBILE";
    return "WEB";
}

module.exports = { getAuditLogs };
