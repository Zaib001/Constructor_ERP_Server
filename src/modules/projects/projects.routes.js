const express = require('express');
const router = express.Router();
const projectsController = require('./projects.controller');
const financeController = require('./finance.controller');
const authenticateJWT = require('../../middleware/authenticateJWT');
const requirePermission = require('../../middleware/requirePermission');

router.use(authenticateJWT);

// Finance sub-routes (must come before /:id to avoid param conflict)
router.get('/:projectId/finance/budget-vs-actual', requirePermission("finance.read"), financeController.getBudgetVsActual);

router.get('/', requirePermission("project.read"), projectsController.getAll);
router.get('/:id', requirePermission("project.read"), projectsController.getById);
router.post('/', requirePermission("project.create"), projectsController.create);
router.put('/:id', requirePermission("project.update"), projectsController.update);
router.delete('/:id', requirePermission("project.archive"), projectsController.delete);

module.exports = router;
