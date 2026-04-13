"use strict";

const router = require('express').Router();
const controller = require('./mobilization.controller');
const authenticateJWT = require('../../../middleware/authenticateJWT');
const requirePermission = require('../../../middleware/requirePermission');

const canManage = requirePermission("execution.manage");

router.use(authenticateJWT);

router.get('/', controller.listLogs);
router.post('/', canManage, controller.createLog);
router.put('/:id', canManage, controller.updateStatus);

module.exports = router;
