"use strict";

const express = require("express");
const router = express.Router();
const vehiclesController = require("./vehicles.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/",       requirePermission("fleet.read"),   vehiclesController.getAllVehicles);
router.get("/:id",    requirePermission("fleet.read"),   vehiclesController.getVehicleById);
router.post("/",      requirePermission("fleet.create"), vehiclesController.createVehicle);
router.put("/:id",    requirePermission("fleet.update"), vehiclesController.updateVehicle);
router.delete("/:id", requirePermission("fleet.update"), vehiclesController.deleteVehicle);

module.exports = router;
