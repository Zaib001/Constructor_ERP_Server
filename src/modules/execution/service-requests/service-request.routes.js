"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("./service-request.controller");
const authenticateJWT = require("../../../middleware/authenticateJWT");
const requirePermission = require("../../../middleware/requirePermission");

const canManage = requirePermission("execution.manage");
const canApprove = requirePermission("execution.approve");

router.use(authenticateJWT);

router.get("/", ctrl.listRequests);
router.post("/", canManage, ctrl.createRequest);
router.post("/:id/action", canManage, ctrl.submitAction); // Actions like conversion or submission require manage/approve

module.exports = router;
