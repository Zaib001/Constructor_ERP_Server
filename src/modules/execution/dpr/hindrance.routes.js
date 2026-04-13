const express = require('express');
const router = express.Router();
const ctrl = require('./hindrance.controller');
const authenticateJWT = require('../../../middleware/authenticateJWT');
const requirePermission = require('../../../middleware/requirePermission');

router.use(authenticateJWT);

// Execution permissions usually include ground-ops management
const canManage = requirePermission('execution.manage');

router.get('/', ctrl.listHindrances);
router.post('/', canManage, ctrl.createHindrance);
router.patch('/:id/resolve', canManage, ctrl.resolveHindrance);

module.exports = router;
