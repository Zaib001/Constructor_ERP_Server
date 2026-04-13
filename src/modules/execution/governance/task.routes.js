const express = require('express');
const router = express.Router();
const taskController = require('./task.controller');
const authenticateJWT = require('../../../middleware/authenticateJWT');
const requirePermission = require('../../../middleware/requirePermission');

const canManage = requirePermission("execution.manage");

router.use(authenticateJWT);

router.post('/', canManage, taskController.assignTask);
router.get('/', taskController.listTasks);
router.patch('/:id/status', taskController.updateTaskStatus);

module.exports = router;
