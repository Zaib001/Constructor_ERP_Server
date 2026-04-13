const timesheetService = require('./timesheet.service');
const logger = require('../../../logger');

async function clockIn(req, res) {
    try {
        const result = await timesheetService.clockIn(req.body, req.user.id, req.user.companyId);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error(`Error in clockIn: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

async function clockOut(req, res) {
    try {
        const { id } = req.params;
        const result = await timesheetService.clockOut(id, req.body, req.user.id, req.user.companyId);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`Error in clockOut: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

async function bulkClockIn(req, res) {
    try {
        const result = await timesheetService.bulkClockIn(req.body, req.user.id, req.user.companyId);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error(`Error in bulkClockIn: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

async function listActiveResources(req, res) {
    try {
        const result = await timesheetService.listActiveResources(req.query, req.user.companyId);
        res.json({ success: true, data: result.data });
    } catch (error) {
        logger.error(`Error in listActiveResources: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

async function getPresenceSummary(req, res) {
    try {
        const { projectId } = req.params;
        const result = await timesheetService.getDailyPresenceSummary(projectId, req.user.companyId);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`Error in getPresenceSummary: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

module.exports = {
    clockIn,
    clockOut,
    bulkClockIn,
    listActiveResources,
    getPresenceSummary
};
