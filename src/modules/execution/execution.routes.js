const router = require('express').Router();
const authenticateJWT = require('../../middleware/authenticateJWT');
const requirePermission = require('../../middleware/requirePermission');

// Services
const dprRoutes           = require('./dpr/dpr.routes');
const progressSvc         = require('./progress/progress.service');
const costControlSvc      = require('./costControl/costControl.service');
const billingSvc          = require('./billing/billing.service');
const qhseSvc             = require('./qhse/qhse.service');
const riskSvc             = require('./risk/risk.service');
const delaysSvc           = require('./delays/delays.service');
const initiationRoutes    = require('./initiation/initiation.routes');
const allocationRoutes    = require('./resource-allocation/allocation.routes');
const serviceReqRoutes    = require('./service-requests/service-request.routes');
const storePlanRoutes     = require('./store-planning/inventory-planning.routes');
const logisticsRoutes     = require('./logistics/logistics.routes');
const deliveryRoutes      = require('./delivery/delivery.routes');
const mobilizationRoutes  = require('./mobilization/mobilization.routes');
const taskRoutes          = require('./governance/task.routes');
const timesheetRoutes     = require('./resources/timesheet.routes');
const hindranceRoutes     = require('./dpr/hindrance.routes');

// ─── Auth on all execution routes ─────────────────────────────────────────────
router.use(authenticateJWT);

// Helper for fast assignment
const canRead = requirePermission("execution.read");
const canManage = requirePermission("execution.manage");
const canApprove = requirePermission("execution.approve");

// ════════════════════════════════════════════════════════════
// DPR (delegated to its own router)
// ════════════════════════════════════════════════════════════
router.use('/dpr', canRead, dprRoutes);

// ════════════════════════════════════════════════════════════
// INITIATION & PLANNING
// ════════════════════════════════════════════════════════════
router.use('/initiation', canRead, initiationRoutes);

// ─── Resource Allocation & Execution (Phase 2) ──────────────────────────────
router.use('/resource-allocation', canRead, allocationRoutes);
router.use('/service-requests', canRead, serviceReqRoutes);
router.use('/store-planning', canRead, storePlanRoutes);
router.use('/logistics', canRead, logisticsRoutes);
router.use('/delivery', canRead, deliveryRoutes);
router.use('/mobilization', canRead, mobilizationRoutes);
router.use('/tasks', canRead, taskRoutes);
router.use('/timesheets', canRead, timesheetRoutes);

// ════════════════════════════════════════════════════════════
// PROGRESS ENGINE
// ════════════════════════════════════════════════════════════
router.get('/progress/:projectId', canRead, async (req, res) => {
  try {
    const data = await progressSvc.getProjectProgress(req.params.projectId, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Project not found') return res.status(404).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/wbs-progress/:projectId', canRead, async (req, res) => {
  try {
    const data = await progressSvc.getWBSProgress(req.params.projectId, req.user);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// COST CONTROL
// ════════════════════════════════════════════════════════════
router.get('/cost-control/:projectId', canRead, async (req, res) => {
  try {
    const data = await costControlSvc.getCostControl(req.params.projectId, req.user);
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Project not found') return res.status(404).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/cost-control/close-cycle/:cycleId', canManage, async (req, res) => {
  try {
    const data = await costControlSvc.closeBillingCycle(req.params.cycleId, req.user);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// BOQ
// ════════════════════════════════════════════════════════════
router.get('/boq', canRead, async (req, res) => {
  try {
    const data = await qhseSvc.listBOQItems(req.query.project_id, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/boq', canManage, async (req, res) => {
  try {
    const data = await qhseSvc.createBOQItem(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.put('/boq/:id', canManage, async (req, res) => {
  try {
    const data = await qhseSvc.updateBOQItem(req.params.id, req.body, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.delete('/boq/:id', canManage, async (req, res) => {
  try {
    await qhseSvc.deleteBOQItem(req.params.id, req.user.company_id);
    res.json({ success: true, message: 'BOQ item deleted' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// BILLING
// ════════════════════════════════════════════════════════════
router.get('/billing', canRead, async (req, res) => {
  try {
    const data = await billingSvc.listInvoices(req.query, req.user);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/billing', canManage, async (req, res) => {
  try {
    const data = await billingSvc.createProgressInvoice(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.get('/billing/:id', canRead, async (req, res) => {
  try {
    const data = await billingSvc.getInvoiceById(req.params.id, req.user);
    if (!data) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/billing/:id/action', canApprove, async (req, res) => {
  try {
    const data = await billingSvc.updateInvoiceStatus(req.params.id, req.body.action, req.body, req.user);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// Billing Cycles
router.get('/billing-cycles', canRead, async (req, res) => {
  try {
    const data = await billingSvc.listBillingCycles(req.query.project_id, req.user);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/billing-cycles', canManage, async (req, res) => {
  try {
    const data = await billingSvc.createBillingCycle(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// INSPECTIONS (ITP)
// ════════════════════════════════════════════════════════════
router.get('/inspections', canRead, async (req, res) => {
  try {
    const data = await qhseSvc.listInspections(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/inspections', canManage, async (req, res) => {
  try {
    const data = await qhseSvc.createInspection(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.put('/inspections/:id', canManage, async (req, res) => {
  try {
    const data = await qhseSvc.updateInspection(req.params.id, req.body, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// NCR
// ════════════════════════════════════════════════════════════
router.get('/ncr', canRead, async (req, res) => {
  try {
    const data = await qhseSvc.listNCRs(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/ncr', canManage, async (req, res) => {
  try {
    const data = await qhseSvc.createNCR(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.put('/ncr/:id', canManage, async (req, res) => {
  try {
    const data = await qhseSvc.updateNCR(req.params.id, req.body, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// SAFETY INCIDENTS
// ════════════════════════════════════════════════════════════
router.get('/incidents', canRead, async (req, res) => {
  try {
    const data = await qhseSvc.listIncidents(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/incidents', canManage, async (req, res) => {
  try {
    const data = await qhseSvc.createIncident(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.put('/incidents/:id', canManage, async (req, res) => {
  try {
    const data = await qhseSvc.updateIncident(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// HSE INDUCTIONS
// ════════════════════════════════════════════════════════════
router.get('/inductions', canRead, async (req, res) => {
  try {
    const data = await qhseSvc.listInductions(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/inductions', canManage, async (req, res) => {
  try {
    const data = await qhseSvc.createInduction(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.get('/hse-summary/:projectId', canRead, async (req, res) => {
  try {
    const data = await qhseSvc.getHSESummary(req.params.projectId, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// RISK REGISTER
// ════════════════════════════════════════════════════════════
router.get('/risks', canRead, async (req, res) => {
  try {
    const data = await riskSvc.listRisks(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/risks', canManage, async (req, res) => {
  try {
    const data = await riskSvc.createRisk(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.put('/risks/:id', canManage, async (req, res) => {
  try {
    const data = await riskSvc.updateRisk(req.params.id, req.body, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// HINDRANCE LOG (Phase 4 Industrial)
// ════════════════════════════════════════════════════════════
router.use('/hindrances', canRead, hindranceRoutes);

// ════════════════════════════════════════════════════════════
// DELAYS
// ════════════════════════════════════════════════════════════
router.get('/delays', canRead, async (req, res) => {
  try {
    const data = await delaysSvc.listDelays(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/delays', canManage, async (req, res) => {
  try {
    const data = await delaysSvc.createDelay(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.patch('/delays/:id', canApprove, async (req, res) => {
  try {
    const data = await delaysSvc.updateDelay(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    const logger = require('../../logger');
    logger.error('Delay update failed', { id: req.params.id, error: err.message, stack: err.stack });
    res.status(400).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// VARIATION ORDERS
// ════════════════════════════════════════════════════════════
router.get('/variations', canRead, async (req, res) => {
  try {
    const data = await delaysSvc.listVariationOrders(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/variations', canManage, async (req, res) => {
  try {
    const data = await delaysSvc.createVariationOrder(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.post('/variations/:id/action', canApprove, async (req, res) => {
  try {
    const data = await delaysSvc.approveVariationOrder(req.params.id, req.user.id, req.body.action);
    res.json({ success: true, data });
  } catch (err) {
    const logger = require('../../logger');
    logger.error('VO action failed', { id: req.params.id, action: req.body.action, error: err.message });
    res.status(400).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// CLAIMS
// ════════════════════════════════════════════════════════════
router.get('/claims', canRead, async (req, res) => {
  try {
    const data = await delaysSvc.listClaims(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/claims', canManage, async (req, res) => {
  try {
    const data = await delaysSvc.createClaim(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.patch('/claims/:id/resolve', canApprove, async (req, res) => {
  try {
    const data = await delaysSvc.resolveClaim(req.params.id, req.user.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// RFI
// ════════════════════════════════════════════════════════════
router.get('/rfis', canRead, async (req, res) => {
  try {
    const data = await delaysSvc.listRFIs(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/rfis', canManage, async (req, res) => {
  try {
    const data = await delaysSvc.createRFI(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.put('/rfis/:id', canManage, async (req, res) => {
  try {
    const data = await delaysSvc.updateRFI(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.patch('/rfis/:id/respond', canManage, async (req, res) => {
  try {
    const data = await delaysSvc.respondToRFI(req.params.id, req.user.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// SUBMITTALS
// ════════════════════════════════════════════════════════════
router.get('/submittals', canRead, async (req, res) => {
  try {
    const data = await delaysSvc.listSubmittals(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/submittals', canManage, async (req, res) => {
  try {
    const data = await delaysSvc.createSubmittal(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.put('/submittals/:id', canManage, async (req, res) => {
  try {
    const data = await delaysSvc.updateSubmittal(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
router.patch('/submittals/:id/review', canApprove, async (req, res) => {
  try {
    const data = await delaysSvc.reviewSubmittal(req.params.id, req.user.id, req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ════════════════════════════════════════════════════════════
// MEETINGS (MOM)
// ════════════════════════════════════════════════════════════
router.get('/meetings', canRead, async (req, res) => {
  try {
    const data = await delaysSvc.listMeetings(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.post('/meetings', canManage, async (req, res) => {
  try {
    const data = await delaysSvc.createMeeting(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

module.exports = router;
