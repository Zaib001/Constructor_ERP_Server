"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./raBills.controller");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", 
    requirePermission("subcontract.rabill.read"),
    controller.getRaBills
);

router.get("/:id", 
    requirePermission("subcontract.rabill.read"),
    controller.getRaBillById
);

router.get("/pending-measurements/:workOrderId",
    requirePermission("subcontract.rabill.write"),
    controller.getPendingMeasurements
);

router.post("/", 
    requirePermission("subcontract.rabill.write"),
    controller.createRaBill
);

router.post("/:id/submit", 
    requirePermission("subcontract.rabill.write"),
    controller.submitRaBill
);

router.post("/:id/revision",
    requirePermission("subcontract.rabill.write"),
    controller.createRevision
);

module.exports = router;
