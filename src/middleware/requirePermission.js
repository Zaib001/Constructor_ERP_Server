"use strict";

const prisma = require("../db");
const logger = require("../logger");

/**
 * Higher-order middleware factory: requirePermission(permissionCode)
 *
 * Usage:  router.post("/register", authenticateJWT, requirePermission("user.create"), ...)
 *
 * Looks up the calling user's role → checks auth.role_permissions → auth.permissions.
 * Returns 403 if the permission code is not found for that role.
 */
function requirePermission(permissionCode) {
    return async function (req, res, next) {
        try {
            if (!req.user || !req.user.roleId) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: no role assigned",
                });
            }

            // 1. Admin Overrides
            const userWithRole = await prisma.user.findUnique({
                where: { id: req.user.userId },
                include: { roles: true }
            });

            const roleCode = userWithRole?.roles?.code;
            if (["super_admin", "erp_admin"].includes(roleCode)) {
                return next();
            }

            // 2. Explicit Permission Check
            const granted = await prisma.rolePermission.findFirst({
                where: {
                    role_id: req.user.roleId,
                    permissions: {
                        code: permissionCode,
                    },
                },
                include: {
                    permissions: true,
                },
            });

            if (!granted) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied: missing permission '${permissionCode}'`,
                });
            }

            next();
        } catch (err) {
            logger.error("requirePermission error:", { error: err.message });
            next(err);
        }
    };
}

module.exports = requirePermission;
