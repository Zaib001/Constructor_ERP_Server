"use strict";

const prisma = require("../db");
const logger = require("../logger");

/**
 * Higher-order middleware factory: requirePermission(permissionCode)
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

            // 1. Admin Overrides (Leverage roleCode from authenticateJWT)
            if (["super_admin", "erp_admin"].includes(req.user.roleCode)) {
                return next();
            }

            const codeQuery = Array.isArray(permissionCode) 
                ? { in: permissionCode } 
                : permissionCode;

            // 2. Explicit Permission Check (Use correct relationship names from schema)
            const granted = await prisma.rolePermission.findFirst({
                where: {
                    role_id: req.user.roleId,
                    permissions: {
                        code: codeQuery,
                    },
                },
            });

            if (!granted) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied: missing permission '${Array.isArray(permissionCode) ? permissionCode.join(' OR ') : permissionCode}'`,
                });
            }

            next();
        } catch (err) {
            logger.error("requirePermission error:", { 
                error: err.message, 
                code: permissionCode,
                userId: req.user?.id 
            });
            next(err);
        }
    };
}

module.exports = requirePermission;
