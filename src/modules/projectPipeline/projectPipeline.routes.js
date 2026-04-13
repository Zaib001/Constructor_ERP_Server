const express = require('express');
const router = express.Router();
const pipelineController = require('./projectPipeline.controller');
const authenticateJWT = require('../../middleware/authenticateJWT');
const requirePermission = require('../../middleware/requirePermission');

router.use(authenticateJWT);

router.get('/', requirePermission('project.read'), pipelineController.getPipeline);
router.post('/auto-update', requirePermission('project.update'), pipelineController.runAutoUpdate);
router.get('/:id/history', requirePermission('project.read'), pipelineController.getHistory);
router.patch('/:id/status', requirePermission('project.update'), pipelineController.updateStatus);

module.exports = router;
