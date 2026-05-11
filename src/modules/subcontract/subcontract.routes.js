"use strict";

const express = require("express");
const router = express.Router();
const authenticateJWT = require("../../middleware/authenticateJWT");

// Sub-module routes
const workOrderRoutes = require("./workOrders/workOrders.routes");
const mobilizationRoutes = require("./mobilization/mobilization.routes");
const measurementRoutes = require("./measurements/measurements.routes");
const raBillRoutes = require("./raBills/raBills.routes");
const paymentRoutes = require("./payments/payments.routes");

// Apply authentication to all subcontract routes
router.use(authenticateJWT);

router.use("/work-orders", workOrderRoutes);
router.use("/mobilization", mobilizationRoutes);
router.use("/measurements", measurementRoutes);
router.use("/ra-bills", raBillRoutes);
router.use("/payments", paymentRoutes);

module.exports = router;
