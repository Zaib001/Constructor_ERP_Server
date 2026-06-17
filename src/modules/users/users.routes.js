"use strict";

const express = require("express");
const router = express.Router();
const usersController = require("./users.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.post("/fcm-token", usersController.upsertFcmToken);
router.delete("/fcm-token", usersController.deleteFcmToken);

router.post("/", requirePermission(["user.create", "user.register"]), usersController.createUser);
router.get("/", requirePermission("user.read"), usersController.listUsers);
router.get("/:id/projects", requirePermission("user.read"), usersController.getUserProjects);
router.get("/:id", requirePermission("user.read"), usersController.getUserById);
router.patch("/:id", requirePermission("user.update"), usersController.updateUser);
router.delete("/:id", requirePermission("user.update"), usersController.deleteUser);

module.exports = router;
