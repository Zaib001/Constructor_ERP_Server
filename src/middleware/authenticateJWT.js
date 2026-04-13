"use strict";

const jwt = require("jsonwebtoken");
const prisma = require("../db");
const logger = require("../logger");

/**
 * Middleware: authenticateJWT
 *
 * 1. Reads `Authorization: Bearer <token>` header.
 * 2. Verifies signature with JWT_SECRET.
 * 3. Confirms the session is still active in auth.user_sessions
 *    (so that logout truly invalidates the token).
 * 4. Attaches { userId, roleId, email } to req.user.
 */
async function authenticateJWT(req, res, next) {
    try {
        const authHeader = req.headers["authorization"];

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authorization token missing",
            });
        }

        const token = authHeader.split(" ")[1];

        // Verify signature & expiry
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: err.name === "TokenExpiredError" ? "Token expired" : "Invalid token",
            });
        }

        // Confirm session is still active (logout invalidation)
        const session = await prisma.userSession.findFirst({
            where: {
                jwt_token: token,
                is_active: true,
            },
        });

        if (!session) {
            return res.status(401).json({
                success: false,
                message: "Session expired or already logged out",
            });
        }

        // Fetch full user details to have roleCode and companyId available in req.user
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: {
                roles: { select: { code: true } },
                company: { select: { id: true } }
            }
        });

        if (!user || user.deleted_at !== null || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: "User account is inactive or no longer exists",
            });
        }

        // Attach standardized user object
        const roleCode = user.roles?.code?.toLowerCase();
        const finalCompanyId = user.company_id || user.company?.id;

        // Attach standardized user object
        req.user = {
            id: user.id,
            userId: user.id, // legacy support
            roleId: user.role_id,
            roleCode,
            companyId: finalCompanyId,
            company_id: finalCompanyId, // legacy/database column support
            email: user.email,
            sessionId: session.id,
            isSuperAdmin: roleCode === "super_admin",
            isCompanyHead: roleCode === "erp_admin",
            departmentId: user.department_id,
        };
        req.token = token;

        next();
    } catch (err) {
        logger.error("authenticateJWT error:", { error: err.message });
        next(err);
    }
}

module.exports = authenticateJWT;
