const express = require("express");
const departmentsController = require("./departments.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

const router = express.Router();

// Get all active departments (Authenticated users)
router.get("/", authenticateJWT, departmentsController.getAllDepartments);

// Get single department with details
router.get("/:id", authenticateJWT, departmentsController.getDepartmentById);

// Manage departments (Admin only)
router.post("/", authenticateJWT, requirePermission("department.manage"), departmentsController.createDepartment);

// Update department (assign head, change name, link company)
router.patch("/:id", authenticateJWT, requirePermission("department.manage"), departmentsController.updateDepartment);

// Deactivate department
router.delete("/:id", authenticateJWT, requirePermission("department.manage"), departmentsController.deleteDepartment);

module.exports = router;
