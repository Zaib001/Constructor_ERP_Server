const svc = require('./initiation.service');
const approvalsSvc = require('../../approvals/approvals.service');

exports.createPlan = async (req, res) => {
  try {
    const companyId = req.user.company_id || req.user.companyId;
    const data = await svc.createPlan(req.body, req.user.id, companyId);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

exports.listPlans = async (req, res) => {
  try {
    const companyId = req.user.company_id || req.user.companyId;
    const data = await svc.listPlans(req.query, companyId);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getPlan = async (req, res) => {
  try {
    const data = await svc.getPlan(req.params.id, req.user.company_id);
    if (!data) return res.status(404).json({ success: false, message: 'Plan not found' });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.actionPlan = async (req, res) => {
  try {
    const plan = await svc.getPlan(req.params.id, req.user.company_id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    
    // Delegate to enterprise approval engine
    await approvalsSvc.requestApproval({
      companyId: req.user.company_id,
      projectId: plan.project_id,
      departmentId: req.user.department_id || null, // Optional routing logic
      docType: 'PROJECT_PLAN',
      docId: plan.id,
      requestedBy: req.user.id,
      amount: plan.contract_value || 0
    });

    await svc.updatePlanStatus(plan.id, 'in_approval', req.user.company_id);

    res.json({ success: true, message: 'Baseline submitted for approval.' });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// BOQ Validations
exports.syncValidations = async (req, res) => {
  try {
    const data = await svc.syncBOQValidations(req.body.plan_id, req.body.project_id, req.user.id, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

exports.listValidations = async (req, res) => {
  try {
    const data = await svc.listBOQValidations(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateValidation = async (req, res) => {
  try {
    const data = await svc.updateBOQValidation(req.params.id, req.body, req.user.id, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

// Procurement Plan
exports.createProcurementItem = async (req, res) => {
  try {
    const data = await svc.createProcurementItem(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

exports.listProcurementItems = async (req, res) => {
  try {
    const data = await svc.listProcurementItems(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateProcurementItem = async (req, res) => {
  try {
    const data = await svc.updateProcurementItem(req.params.id, req.body, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

exports.deleteProcurementItem = async (req, res) => {
  try {
    await svc.deleteProcurementItem(req.params.id, req.user.company_id);
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

// Resource Plan
exports.createResourcePlan = async (req, res) => {
  try {
    const data = await svc.createResourcePlan(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

exports.listResourcePlans = async (req, res) => {
  try {
    const data = await svc.listResourcePlans(req.query, req.user.company_id);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateResourcePlan = async (req, res) => {
  try {
    const data = await svc.updateResourcePlan(req.params.id, req.body, req.user.company_id);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

exports.deleteResourcePlan = async (req, res) => {
  try {
    await svc.deleteResourcePlan(req.params.id, req.user.company_id);
    res.json({ success: true, message: 'Plan deleted' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};
