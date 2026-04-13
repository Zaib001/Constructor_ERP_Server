"use strict";

const { Router } = require("express");
const router = Router();

const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");
const { validate } = require("../../middleware/validate.middleware");
const { CreateDelegationSchema } = require("./delegations.validator");
const controller = require("./delegations.controller");

const readGuard = [authenticateJWT, requirePermission("delegation.read")];
const writeGuard = [authenticateJWT, requirePermission("delegation.manage")];

// POST /api/delegations
router.post(
    "/",
    ...writeGuard,
    validate(CreateDelegationSchema),
    controller.createDelegation
);

// GET /api/delegations?userId=...&active=true
router.get(
    "/",
    ...readGuard,
    controller.getDelegations
);

// PATCH /api/delegations/:id/disable
router.patch(
    "/:id/disable",
    ...writeGuard,
    controller.disableDelegation
);

module.exports = router;
