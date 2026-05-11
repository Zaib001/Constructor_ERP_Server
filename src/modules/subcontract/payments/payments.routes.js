"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./payments.controller");
const requirePermission = require("../../../middleware/requirePermission");

router.get("/", 
    requirePermission("subcontract.payment.read"),
    controller.getPayments
);

router.post("/", 
    requirePermission("subcontract.payment.write"),
    controller.createPayment
);

module.exports = router;
