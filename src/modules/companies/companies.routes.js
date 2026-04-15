"use strict";

const express = require("express");
const controller = require("./companies.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");
const requireSuperAdmin = require("../../middleware/requireSuperAdmin");

const router = express.Router();

// List all companies (Superadmin only)
router.get("/", authenticateJWT, requireSuperAdmin, controller.getAllCompanies);

// Get single company with details
router.get("/:id", authenticateJWT, requirePermission("company.read"), controller.getCompanyById);

// Create company (Superadmin only)
router.post("/", authenticateJWT, requireSuperAdmin, controller.createCompany);

// Update company
router.patch("/:id", authenticateJWT, requirePermission("company.manage"), controller.updateCompany);

// Deactivate company (Superadmin only)
router.delete("/:id", authenticateJWT, requireSuperAdmin, controller.deleteCompany);

// Detailed Performance (Superadmin only or Company Specific Access)
router.get("/:id/performance", authenticateJWT, requirePermission("company.read"), controller.getDetailedPerformance);

module.exports = router;
