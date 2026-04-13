const taskService = require('./task.service');
const logger = require('../../../logger');

async function assignTask(req, res) {
    try {
        const result = await taskService.assignTask(req.body, req.user.id, req.user.companyId);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error(`Error in assignTask: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

async function updateTaskStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await taskService.updateTaskStatus(id, status, req.user.id, req.user.companyId);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`Error in updateTaskStatus: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

async function listTasks(req, res) {
    try {
        console.log("DEBUG [listTasks] query: ", req.query, "user role: ", req.user.roleCode, "user company:", req.user.companyId);
        const result = await taskService.listTasks(req.query, req.user.companyId);
        console.log("DEBUG [listTasks] returned array length:", result.data.length);
        res.json({ success: true, ...result });
    } catch (error) {
        logger.error(`Error in listTasks: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

module.exports = {
    assignTask,
    updateTaskStatus,
    listTasks
};
