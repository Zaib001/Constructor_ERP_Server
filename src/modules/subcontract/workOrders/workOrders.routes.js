"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./workOrders.controller");
const requirePermission = require("../../../middleware/requirePermission");


router.get("/", 
    requirePermission("subcontract.read"),
    controller.getWorkOrders
);

router.get("/:id", 
    requirePermission("subcontract.read"),
    controller.getWorkOrderById
);

router.post("/", 
    requirePermission("subcontract.write"),
    controller.createWorkOrder
);

router.put("/:id", 
    requirePermission("subcontract.write"),
    controller.updateWorkOrder
);


router.post("/:id/submit", 
    requirePermission("subcontract.write"),
    controller.submitWorkOrder
);

module.exports = router;
