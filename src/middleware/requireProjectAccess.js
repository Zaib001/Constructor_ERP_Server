"use strict";

const prisma = require("../db");
const logger = require("../logger");

/**
 * Middleware: requireProjectAccess(options?)
 *
 * Ensures the authenticated user has an active, non-revoked project assignment
 * before allowing the request through.
 *
 * Project ID is resolved from (in priority order):
 *   1. req.params.projectId
 *   2. req.body.projectId
 *   3. req.query.projectId
 *
 * On success:
 *   - Attaches req.projectAccess = { id, projectId, accessType }
 *
 * On failure:
 *   - 400 — projectId missing from request
 *   - 403 — user has no active access to the project
 *
 * Access-type enforcement (optional, pass into options):
 *   requireProjectAccess({ allowedTypes: ["full"] }) → blocks read_only & approval_only
 *
 * Usage in route:
 *   router.post("/pr", authenticateJWT, requirePermission("pr.create"), requireProjectAccess(), handler)
 *   router.post("/approve", authenticateJWT, requirePermission("pr.approve"), requireProjectAccess({ allowedTypes: ["full", "approval_only"] }), handler)
 */
function requireProjectAccess(options = {}) {
    const { allowedTypes = null } = options; // null = all types permitted

    return async function (req, res, next) {
        try {
            // 1. Resolve projectId from params → body → query
            const projectId =
                req.params.projectId ||
                req.body?.projectId ||
                req.query?.projectId;

            if (!projectId) {
                return res.status(400).json({
                    success: false,
                    message: "projectId is required to access this resource",
                });
            }

            // 2. Look up active assignment in auth.user_projects
            const assignment = await prisma.userProject.findFirst({
                where: {
                    user_id: req.user.userId,
                    project_id: projectId,
                    revoked_at: null,
                },
                select: { id: true, project_id: true, access_type: true },
            });

            if (!assignment) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: you are not assigned to this project",
                });
            }

            // 3. Enforce allowed access types if specified
            if (allowedTypes && !allowedTypes.includes(assignment.access_type)) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied: your access level '${assignment.access_type}' is not permitted for this action`,
                });
            }

            // 4. Enforce read_only restriction on mutating methods
            if (assignment.access_type === "read_only" && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: read-only users cannot perform write operations",
                });
            }

            // 5. Attach access context to request
            req.projectAccess = {
                id: assignment.id,
                projectId: assignment.project_id,
                accessType: assignment.access_type,
            };

            next();
        } catch (err) {
            logger.error("requireProjectAccess error:", { error: err.message });
            next(err);
        }
    };
}

module.exports = requireProjectAccess;
