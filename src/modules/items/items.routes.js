"use strict";

const express = require("express");
const router = express.Router();
const itemsController = require("./items.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");
const requirePermission = require("../../middleware/requirePermission");

router.use(authenticateJWT);

// item.read OR procurement.pr.* roles — PR creators must be able to browse the catalog
const itemReadPerms = ["item.read", "procurement.pr.create", "procurement.pr.read"];
router.get("/",       requirePermission(itemReadPerms),   itemsController.getAllItems);
router.get("/:id",    requirePermission(itemReadPerms),   itemsController.getItemById);
router.post("/",      requirePermission("item.create"), itemsController.createItem);
router.put("/:id",    requirePermission("item.update"), itemsController.updateItem);
router.delete("/:id", requirePermission("item.update"), itemsController.deleteItem);

module.exports = router;
