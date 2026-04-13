"use strict";

const express = require("express");
const router = express.Router();
const progressController = require("./projectProgress.controller");
const authenticateJWT = require("../../middleware/authenticateJWT");

router.use(authenticateJWT);

router.post("/", progressController.createProgress);
router.get("/project/:projectId", progressController.getProgressByProject);

module.exports = router;
