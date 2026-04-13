"use strict";

const express = require("express");
const router = express.Router();
const employeesController = require("./employees.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/",       requirePermission("employee.read"),    employeesController.getAllEmployees);
router.get("/:id",    requirePermission("employee.read"),    employeesController.getEmployeeById);
router.post("/",      requirePermission("employee.create"),  employeesController.createEmployee);
router.put("/:id",    requirePermission("employee.update"),  employeesController.updateEmployee);
router.delete("/:id", requirePermission("employee.archive"), employeesController.deleteEmployee);

module.exports = router;
