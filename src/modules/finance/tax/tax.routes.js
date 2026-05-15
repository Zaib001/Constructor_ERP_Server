"use strict";

const express = require("express");
const router = express.Router();
const taxController = require("./tax.controller");

router.get("/", taxController.getTaxConfigs);
router.post("/", taxController.createTaxConfig);
router.patch("/:id", taxController.updateTaxConfig);

module.exports = router;
