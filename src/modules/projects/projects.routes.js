const express = require('express');
const router = express.Router();
const projectsController = require('./projects.controller');
const authenticateJWT = require('../../middleware/authenticateJWT');
const requirePermission = require('../../middleware/requirePermission');

router.use(authenticateJWT);

router.get('/', requirePermission("project.read"), projectsController.getAll);
router.get('/:id', requirePermission("project.read"), projectsController.getById);
router.post('/', requirePermission("project.create"), projectsController.create);
router.put('/:id', requirePermission("project.update"), projectsController.update);
router.delete('/:id', requirePermission("project.archive"), projectsController.delete);

module.exports = router;
