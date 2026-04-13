const router = require('express').Router();
const ctrl = require('./dpr.controller');
const authenticateJWT = require('../../../middleware/authenticateJWT');
const requirePermission = require('../../../middleware/requirePermission');

const canManage = requirePermission("execution.manage");
const canReview = requirePermission("execution.approve");

router.use(authenticateJWT);

router.get('/',        ctrl.listDPRs);
router.get('/resource-summary', ctrl.getResourceSummary);
router.get('/mission-summary',  ctrl.getMissionSummary);
router.post('/',       canManage, ctrl.createDPR);

router.get('/:id',     ctrl.getDPR);
router.put('/:id',     canManage, ctrl.updateDPR);
router.post('/:id/submit', canManage, ctrl.submitDPR);
router.post('/:id/review', canReview, ctrl.reviewDPR);
router.delete('/:id',  canReview, ctrl.deleteDPR);

module.exports = router;
