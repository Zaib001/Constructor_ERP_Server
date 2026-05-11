"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./mobilization.controller");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", 
    requirePermission("subcontract.read"),
    controller.getMobilizations
);

router.post("/", 
    requirePermission("subcontract.write"),
    controller.createMobilization
);

router.patch("/:id/verify",
    requirePermission("subcontract.write"),
    controller.verifyMobilization
);

module.exports = router;
