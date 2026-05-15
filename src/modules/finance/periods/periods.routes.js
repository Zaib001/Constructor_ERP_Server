"use strict";

const express = require("express");
const router = express.Router();
const periodsController = require("./periods.controller");

router.get("/", periodsController.getPeriods);
router.post("/", periodsController.createPeriod);
router.post("/:id/status", periodsController.updatePeriodStatus);
router.delete("/:id", periodsController.deletePeriod);

module.exports = router;
