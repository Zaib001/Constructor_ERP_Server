"use strict";

const express = require("express");
const router = express.Router();
const svc = require("./logistics.service");
const authenticateJWT = require("../../../middleware/authenticateJWT");
const requirePermission = require("../../../middleware/requirePermission");

const canManage = requirePermission("execution.manage");

const controller = {
  list: async (req, res) => {
    try {
      const data = await svc.listLogisticsRequests(req.query, req.user);
      res.json({ success: true, data });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  },
  create: async (req, res) => {
    try {
      const data = await svc.createLogisticsRequest(req.body, req.user);
      res.status(201).json({ success: true, data });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
  }
};

router.use(authenticateJWT);
router.get("/", controller.list);
router.post("/", canManage, controller.create);

module.exports = router;
