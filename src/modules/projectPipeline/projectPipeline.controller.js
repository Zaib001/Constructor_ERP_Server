const pipelineService = require('./projectPipeline.service');
const logger = require('../../logger');

async function getPipeline(req, res, next) {
  try {
    const { companyId } = req.context;
    const data = await pipelineService.getPipelineData(companyId);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('Error fetching project pipeline:', err);
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const userId = req.context.userId;

    if (!Object.values(pipelineService.STATUSES).includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const updated = await pipelineService.updateStatus(id, status, reason, userId);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('Error updating project status:', err);
    next(err);
  }
}

async function getHistory(req, res, next) {
  try {
    const { id } = req.params;
    const history = await pipelineService.getStatusHistory(id);
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error('Error fetching project status history:', err);
    next(err);
  }
}

async function runAutoUpdate(req, res, next) {
    try {
        const { companyId } = req.context;
        const count = await pipelineService.triggerAutoUpdates(companyId);
        res.json({ success: true, message: `Auto-updated ${count} projects` });
    } catch (err) {
        logger.error('Error running pipeline auto-update:', err);
        next(err);
    }
}

module.exports = {
  getPipeline,
  updateStatus,
  getHistory,
  runAutoUpdate
};
