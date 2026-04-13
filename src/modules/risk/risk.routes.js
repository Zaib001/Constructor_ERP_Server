const express = require('express');
const router = express.Router();
const riskService = require('./risk.service');
const authenticateJWT = require('../../middleware/authenticateJWT');
const requirePermission = require('../../middleware/requirePermission');

router.use(authenticateJWT);

const canRead = requirePermission(['risk.read', 'execution.read']);
const canManage = requirePermission(['risk.manage', 'execution.manage']);

// ─── Risk Register ──────────────────────────────────────────────────────────
router.get('/', canRead, async (req, res) => {
  try {
    const data = await riskService.listRisks(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', canManage, async (req, res) => {
  try {
    const data = await riskService.createRisk(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.patch('/:id', canManage, async (req, res) => {
  try {
    const data = await riskService.updateRisk(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ─── Hindrance Logs ──────────────────────────────────────────────────────────
router.get('/hindrances', canRead, async (req, res) => {
  try {
    const data = await riskService.listHindrances(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/hindrances', canManage, async (req, res) => {
  try {
    const data = await riskService.createHindrance(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.patch('/hindrances/:id', canManage, async (req, res) => {
  try {
    const data = await riskService.updateHindrance(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

module.exports = router;
