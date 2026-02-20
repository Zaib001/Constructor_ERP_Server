"use strict";

const express = require("express");
const router = express.Router();
const usersController = require("./users.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

/**
 * Route: GET /api/users
 * Description: Get all users with roles.
 * Access: Authenticated + user.read permission (or admin override in future)
 */
router.get(
    "/",
    authenticateJWT,
    requirePermission("user.register"), // Re-using user.register for now as 'admin' scope
    usersController.getAllUsers
);

/**
 * Route: GET /api/users/:id
 * Description: Get a single user.
 */
router.get(
    "/:id",
    authenticateJWT,
    requirePermission("user.register"),
    usersController.getUserById
);

/**
 * Route: PATCH /api/users/:id
 * Description: Update a user.
 */
router.patch(
    "/:id",
    authenticateJWT,
    requirePermission("user.register"),
    usersController.updateUser
);

/**
 * Route: DELETE /api/users/:id
 * Description: Soft-delete a user.
 */
router.delete(
    "/:id",
    authenticateJWT,
    requirePermission("user.register"),
    usersController.deleteUser
);

module.exports = router;
