"use strict";

const express = require("express");
const controller = require("./profitShare.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = express.Router();

router.get("/", authenticateJWT, requirePermission("profitshare.read"), controller.getAllRules);
router.get("/calculate", authenticateJWT, requirePermission("profitshare.read"), controller.calculateShare);
router.get("/:id", authenticateJWT, requirePermission("profitshare.read"), controller.getRuleById);
router.post("/", authenticateJWT, requirePermission("settings.manage"), controller.createRule);
router.patch("/:id", authenticateJWT, requirePermission("settings.manage"), controller.updateRule);
router.delete("/:id", authenticateJWT, requirePermission("settings.manage"), controller.deleteRule);

module.exports = router;
