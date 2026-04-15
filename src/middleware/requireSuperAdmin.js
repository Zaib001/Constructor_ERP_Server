"use strict";

/**
 * Middleware: requireSuperAdmin
 * 
 * Strictly restricts access to users with roleCode 'super_admin'.
 * Used for global infrastructure management.
 */
function requireSuperAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Authentication required"
        });
    }

    if (req.user.roleCode !== "super_admin") {
        return res.status(403).json({
            success: false,
            message: "Access Denied: Super Admin privileges required for this action."
        });
    }

    next();
}

module.exports = requireSuperAdmin;
