const closureService = require("./projectClosure.service");

async function handleGetReadiness(req, res) {
    try {
        const result = await closureService.checkReadiness(req.params.projectId, req.user);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

async function handleGetPunchList(req, res) {
    try {
        const result = await closureService.getPunchList(req.params.projectId, req.user);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

async function handleCreatePunchItem(req, res) {
    try {
        const result = await closureService.createPunchItem(req.params.projectId, req.body, req.user);
        res.status(201).json({ success: true, data: result, message: "Snag item recorded successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

async function handleUpdatePunchStatus(req, res) {
    try {
        const result = await closureService.updatePunchStatus(req.params.id, req.body.status, req.user);
        res.json({ success: true, data: result, message: "Status updated" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

async function handleSubmitClosure(req, res) {
    try {
        const result = await closureService.submitClosureRequest(req.params.projectId, req.body, req.user);
        res.json({ success: true, data: result, message: "Closure request submitted for final review" });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
}

async function handleGetClosureStatus(req, res) {
    try {
        const result = await closureService.getClosureStatus(req.params.projectId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

module.exports = {
    handleGetReadiness,
    handleGetPunchList,
    handleCreatePunchItem,
    handleUpdatePunchStatus,
    handleSubmitClosure,
    handleGetClosureStatus
};
