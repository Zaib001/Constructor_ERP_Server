"use strict";

const express = require("express");
const router = express.Router();
const documentsController = require("./documents.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

// Company Documents
router.get("/company",       requirePermission("document.read"),   documentsController.getAllCompanyDocuments);
router.get("/company/:id",   requirePermission("document.read"),   documentsController.getCompanyDocumentById);
router.post("/company",      requirePermission("document.create"),  documentsController.createCompanyDocument);
router.put("/company/:id",   requirePermission("document.update"),  documentsController.updateCompanyDocument);
router.delete("/company/:id",requirePermission("document.update"),  documentsController.deleteCompanyDocument);

// Facility / Project Documents
router.get("/facility",       requirePermission("document.read"),   documentsController.getAllFacilityDocuments);
router.get("/facility/:id",   requirePermission("document.read"),   documentsController.getFacilityDocumentById);
router.post("/facility",      requirePermission("document.create"),  documentsController.createFacilityDocument);
router.put("/facility/:id",   requirePermission("document.update"),  documentsController.updateFacilityDocument);
router.delete("/facility/:id",requirePermission("document.update"),  documentsController.deleteFacilityDocument);

module.exports = router;
