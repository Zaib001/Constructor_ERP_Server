"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("./assets.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");

router.use(authenticateJWT);

router.get("/", ctrl.list);
router.get("/:id", ctrl.getById);
router.post("/", ctrl.create);
router.post("/depreciate", ctrl.depreciate);        // before /:id routes
router.patch("/:id/approve", ctrl.approve);
router.post("/:id/allocate", ctrl.allocate);
router.post("/:id/dispose", ctrl.dispose);

module.exports = router;
