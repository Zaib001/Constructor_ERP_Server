const express = require('express');
const router = express.Router();
const timesheetController = require('./timesheet.controller');
const authenticateJWT = require('../../../middleware/authenticateJWT');
const requirePermission = require('../../../middleware/requirePermission');

const canManage = requirePermission("execution.manage");

router.use(authenticateJWT);

router.get('/', timesheetController.listActiveResources);
router.get('/summary/:projectId', timesheetController.getPresenceSummary);
router.post('/clock-in', timesheetController.clockIn);
router.post('/bulk-clock-in', canManage, timesheetController.bulkClockIn);
router.patch('/clock-out/:id', timesheetController.clockOut);

module.exports = router;
