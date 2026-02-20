"use strict";

const requirePermission = require("./requirePermission");
const requireProjectAccess = require("./requireProjectAccess");

/**
 * guard({ permission?, project?, accessTypes? })
 * ─────────────────────────────────────────────────────────────────────────────
 * Convenience factory that composes multiple middleware functions into a single
 * guard array. Use the spread operator when applying to a route:
 *
 *   router.post(
 *     "/approvals/request",
 *     authenticateJWT,
 *     ...guard({ permission: "approval.request", project: true }),
 *     validate(ApprovalRequestSchema),
 *     controller
 *   )
 *
 * @param {object}   options
 * @param {string}   [options.permission]   - Permission code to enforce (e.g. "pr.create")
 * @param {boolean}  [options.project]      - Whether to enforce project-level access
 * @param {string[]} [options.accessTypes]  - Allowed project access types (subset of full/approval_only/read_only)
 * @returns {Function[]} Array of middleware functions
 */
function guard({ permission = null, project = false, accessTypes = null } = {}) {
    const middlewares = [];

    if (permission) {
        middlewares.push(requirePermission(permission));
    }

    if (project) {
        middlewares.push(
            requireProjectAccess(
                accessTypes ? { allowedTypes: accessTypes } : {}
            )
        );
    }

    return middlewares;
}

module.exports = guard;
