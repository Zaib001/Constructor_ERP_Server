const express = require('express');
const router = express.Router();
const hseService = require('./hse.service');
const authenticateJWT = require('../../middleware/authenticateJWT');
const requirePermission = require('../../middleware/requirePermission');

router.use(authenticateJWT);

// Roles: hse.read, hse.manage
const canRead = requirePermission(['hse.read', 'execution.read']);
const canManage = requirePermission(['hse.manage', 'execution.manage']);

// ─── Safety Incidents ───────────────────────────────────────────────────────
router.get('/incidents', canRead, async (req, res) => {
  try {
    const data = await hseService.listIncidents(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/incidents', canManage, async (req, res) => {
  try {
    const data = await hseService.createIncident(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.patch('/incidents/:id', canManage, async (req, res) => {
  try {
    const data = await hseService.updateIncident(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ─── HSE Inductions ────────────────────────────────────────────────────────
router.get('/inductions', canRead, async (req, res) => {
  try {
    const data = await hseService.listInductions(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/inductions', canManage, async (req, res) => {
  try {
    const data = await hseService.createInduction(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ─── Safety Logs ───────────────────────────────────────────────────────────
router.get('/logs', canRead, async (req, res) => {
  try {
    const data = await hseService.listSafetyLogs(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/logs', canManage, async (req, res) => {
  try {
    const data = await hseService.createSafetyLog(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.patch('/logs/:id', canManage, async (req, res) => {
  try {
    const data = await hseService.updateSafetyLog(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ─── Safety JSA ────────────────────────────────────────────────────────────
router.get('/jsas', canRead, async (req, res) => {
  try {
    const data = await hseService.listJSAs(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/jsas', canManage, async (req, res) => {
  try {
    const data = await hseService.createJSA(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.patch('/jsas/:id/status', canManage, async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const data = await hseService.updateJSAStatus(req.params.id, { status, remarks }, req.user.id);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ─── Summary ───────────────────────────────────────────────────────────────
router.get('/summary/:projectId', canRead, async (req, res) => {
  try {
    const data = await hseService.getHSESummary(req.params.projectId, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
