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

            // 2. Resolve User Details (Role & Company)
            const user = await prisma.user.findFirst({
                where: { id: req.user.userId },
                select: {
                    company_id: true,
                    roles: { select: { code: true } }
                }
            });

            if (!user) {
                return res.status(401).json({ success: false, message: "User not found" });
            }

            const roleCode = user.roles?.code;
            const userCompanyId = user.company_id;

            // 3. Admin Bypass
            if (roleCode === "super_admin" || roleCode === "erp_admin") {
                req.projectAccess = { id: null, projectId, accessType: "full" };
                return next();
            }

            // 4. Look up active assignment in auth.user_projects
            const assignment = await prisma.userProject.findFirst({
                where: {
                    user_id: req.user.userId,
                    project_id: projectId,
                    revoked_at: null,
                },
                select: { id: true, projects: { select: { id: true } }, access_type: true },
            });

            if (assignment) {
                // Attach real assignment context
                req.projectAccess = {
                    id: assignment.id,
                    projectId: assignment.projects?.id,
                    accessType: assignment.access_type,
                };
            } else {
                // 5. Check for Company-wide Access (Department-level visibility)
                const project = await prisma.project.findFirst({
                    where: { id: projectId, company_id: userCompanyId, status: "active" },
                    select: { id: true }
                });

                if (!project) {
                    return res.status(403).json({
                        success: false,
                        message: "Access denied: you are not assigned to this project and it does not belong to your company",
                    });
                }

                // Attach virtual context for company-wide access
                req.projectAccess = {
                    id: null,
                    projectId: project.id,
                    accessType: "department", // Virtual access type
                };
            }

            // 3. Enforce allowed access types if specified
            if (allowedTypes && !allowedTypes.includes(req.projectAccess.accessType)) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied: your access level '${req.projectAccess.accessType}' is not permitted for this action`,
                });
            }

            // 4. Enforce read_only restriction on mutating methods
            if (req.projectAccess.accessType === "read_only" && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: read-only users cannot perform write operations",
                });
            }

            next();
        } catch (err) {
            logger.error("requireProjectAccess error:", { error: err.message });
            next(err);
        }
    };
}

module.exports = requireProjectAccess;
