"use strict";

const express = require("express");
const router = express.Router();
const usersController = require("./users.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

// Create user (admin action)
router.post("/",    requirePermission(["user.create", "user.register"]), usersController.createUser);

// List and view users
router.get("/",    requirePermission("user.read"),     usersController.getAllUsers);
router.get("/:id", requirePermission("user.read"),     usersController.getUserById);

// Update user
router.patch("/:id", requirePermission("user.update"), usersController.updateUser);

// Soft-delete user
router.delete("/:id", requirePermission("user.update"), usersController.deleteUser);

module.exports = router;
