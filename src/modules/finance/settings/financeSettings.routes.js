"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./financeSettings.controller");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", controller.getSettings);
router.post("/", requirePermission("finance.settings.manage"), controller.updateSettings);

module.exports = router;
