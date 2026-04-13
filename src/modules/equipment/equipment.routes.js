"use strict";

const express = require("express");
const router = express.Router();
const equipmentController = require("./equipment.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/", requirePermission("fleet.read"), equipmentController.getAllEquipment);
router.get("/:id", requirePermission("fleet.read"), equipmentController.getEquipmentById);
router.post("/", requirePermission("fleet.create"), equipmentController.createEquipment);
router.put("/:id", requirePermission("fleet.update"), equipmentController.updateEquipment);
router.delete("/:id", requirePermission("fleet.update"), equipmentController.deleteEquipment);

module.exports = router;
