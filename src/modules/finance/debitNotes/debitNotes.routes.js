"use strict";

const express = require("express");
const router  = express.Router();
const ctrl    = require("./debitNotes.controller");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/",      requirePermission("vat.read"),   ctrl.getNotes);
router.post("/",     requirePermission("vat.manage"), ctrl.createNote);
router.post("/:id",  requirePermission("vat.manage"), ctrl.postNote);

module.exports = router;
