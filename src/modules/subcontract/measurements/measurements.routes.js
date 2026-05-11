"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./measurements.controller");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", 
    requirePermission("subcontract.measurement.read"),
    controller.getMeasurements
);

router.get("/:id", 
    requirePermission("subcontract.measurement.read"),
    controller.getMeasurementById
);

router.post("/", 
    requirePermission("subcontract.measurement.write"),
    controller.createMeasurement
);

router.patch("/:id/status", 
    requirePermission("subcontract.rabill.certify"), // QS certification usually happens here
    controller.updateStatus
);

router.post("/:id/revision",
    requirePermission("subcontract.measurement.write"),
    controller.createRevision
);

module.exports = router;
