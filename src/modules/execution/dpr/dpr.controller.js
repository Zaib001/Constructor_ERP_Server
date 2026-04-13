const dprService = require('./dpr.service');

async function createDPR(req, res) {
  try {
    const dpr = await dprService.createDPR(req.body, req.user.id, req.user.company_id);
    res.status(201).json({ success: true, data: dpr });
  } catch (err) {
    res.status(400).json({ 
        success: false, 
        message: err.message,
        dpr_id: err.dpr_id 
    });
  }
}

async function updateDPR(req, res) {
  try {
    const dpr = await dprService.updateDPR(req.params.id, req.body, req.user.id, req.user.company_id);
    res.json({ success: true, data: dpr });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listDPRs(req, res) {
  try {
    const result = await dprService.listDPRs(req.query, req.user.company_id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getDPR(req, res) {
  try {
    const dpr = await dprService.getDPRById(req.params.id, req.user.company_id);
    if (!dpr) return res.status(404).json({ success: false, message: 'DPR not found' });
    res.json({ success: true, data: dpr });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function submitDPR(req, res) {
  try {
    const dpr = await dprService.submitDPR(req.params.id, req.user.id, req.user.company_id);
    res.json({ success: true, data: dpr });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function reviewDPR(req, res) {
  try {
    const { action } = req.body; // 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }
    const dpr = await dprService.reviewDPR(req.params.id, action, req.user.id, req.user.company_id);
    res.json({ success: true, data: dpr });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteDPR(req, res) {
  try {
    await dprService.deleteDPR(req.params.id, req.user.company_id);
    res.json({ success: true, message: 'DPR deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getResourceSummary(req, res) {
  try {
    const { projectId, date } = req.query;
    if (!projectId || !date) throw new Error('Missing projectId or date');
    const result = await dprService.getDailyResourceSummary(projectId, date, req.user.companyId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function getMissionSummary(req, res) {
  try {
    const { projectId, date } = req.query;
    if (!projectId || !date) throw new Error('Missing projectId or date');
    const result = await dprService.getDailyMissionSummary(projectId, date, req.user.companyId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

module.exports = { 
  createDPR, 
  updateDPR, 
  listDPRs, 
  getDPR, 
  submitDPR, 
  reviewDPR, 
  deleteDPR, 
  getResourceSummary,
  getMissionSummary 
};



