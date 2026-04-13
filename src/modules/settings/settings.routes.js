"use strict";

const express = require("express");
const controller = require("./settings.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = express.Router();

// Get all settings
router.get("/", authenticateJWT, requirePermission("settings.read"), controller.getAllSettings);

// Create / update a setting
router.post("/", authenticateJWT, requirePermission("settings.manage"), controller.upsertSetting);

// Delete a setting
router.delete("/:id", authenticateJWT, requirePermission("settings.manage"), controller.deleteSetting);

module.exports = router;
