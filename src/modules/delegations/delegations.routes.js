"use strict";

const { Router } = require("express");
const router = Router();

const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");
const { validate } = require("../../middleware/validate.middleware");
const { CreateDelegationSchema } = require("./delegations.validator");
const controller = require("./delegations.controller");

// All delegation management routes require delegation.manage permission
const guard = [authenticateJWT, requirePermission("delegation.manage")];

// POST /api/delegations
router.post(
    "/",
    ...guard,
    validate(CreateDelegationSchema),
    controller.createDelegation
);

// GET /api/delegations?userId=...&active=true
router.get(
    "/",
    ...guard,
    controller.getDelegations
);

// PATCH /api/delegations/:id/disable
router.patch(
    "/:id/disable",
    ...guard,
    controller.disableDelegation
);

module.exports = router;
