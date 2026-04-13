"use strict";

const router = require('express').Router();
const controller = require('./delivery.controller');
const authenticateJWT = require('../../../middleware/authenticateJWT');
const requirePermission = require('../../../middleware/requirePermission');

const canManage = requirePermission("execution.manage");

router.use(authenticateJWT);

router.get('/', controller.listDeliveries);
router.post('/', canManage, controller.createTracking);
router.put('/:id', canManage, controller.updateStatus);

module.exports = router;
