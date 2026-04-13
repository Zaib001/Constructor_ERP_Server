const router = require('express').Router();
const ctrl = require('./initiation.controller');
const authenticateJWT = require('../../../middleware/authenticateJWT');
const requirePermission = require('../../../middleware/requirePermission');

const canManage = requirePermission("execution.manage");

router.use(authenticateJWT);

// Plans
router.get('/plans',                  ctrl.listPlans);
router.post('/plans',                 canManage, ctrl.createPlan);
router.get('/plans/:id',              ctrl.getPlan);
router.post('/plans/:id/action',      canManage, ctrl.actionPlan);

// BOQ Validations
router.get('/validations',            ctrl.listValidations);
router.post('/validations/sync',      canManage, ctrl.syncValidations);
router.put('/validations/:id',        canManage, ctrl.updateValidation);

// Procurement Plan
router.get('/procurement',            ctrl.listProcurementItems);
router.post('/procurement',           canManage, ctrl.createProcurementItem);
router.put('/procurement/:id',        canManage, ctrl.updateProcurementItem);
router.delete('/procurement/:id',     canManage, ctrl.deleteProcurementItem);

// Resource Plan
router.get('/resources',              ctrl.listResourcePlans);
router.post('/resources',             canManage, ctrl.createResourcePlan);
router.put('/resources/:id',          canManage, ctrl.updateResourcePlan);
router.delete('/resources/:id',       canManage, ctrl.deleteResourcePlan);

module.exports = router;
