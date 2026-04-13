"use strict";

const express = require("express");
const router = express.Router();
const vendorsController = require("./vendors.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

// All routes require authentication
router.use(authenticateJWT);

router.get("/", requirePermission("vendor.read"), vendorsController.getAllVendors);
router.get("/:id", requirePermission("vendor.read"), vendorsController.getVendorById);
router.post("/", requirePermission("vendor.create"), vendorsController.createVendor);
router.put("/:id", requirePermission("vendor.update"), vendorsController.updateVendor);
router.post("/:id/approve", requirePermission("vendor.approve"), vendorsController.approveVendor);
router.put("/:id/suspend", requirePermission("vendor.approve"), vendorsController.suspendVendor);
router.put("/:id/deactivate", requirePermission("vendor.approve"), vendorsController.deactivateVendor);
router.delete("/:id", requirePermission("vendor.update"), vendorsController.deleteVendor);

module.exports = router;
