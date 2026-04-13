"use strict";

const express = require("express");
const router = express.Router();
const itemsController = require("./items.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

router.get("/",       requirePermission("item.read"),   itemsController.getAllItems);
router.get("/:id",    requirePermission("item.read"),   itemsController.getItemById);
router.post("/",      requirePermission("item.create"), itemsController.createItem);
router.put("/:id",    requirePermission("item.update"), itemsController.updateItem);
router.delete("/:id", requirePermission("item.update"), itemsController.deleteItem);

module.exports = router;
