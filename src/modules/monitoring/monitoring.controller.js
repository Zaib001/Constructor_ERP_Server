const service = require("./monitoring.service");

async function getDashboardMetrics(req, res) {
    try {
        const { projectId } = req.params;
        const kpis = await service.getProjectKPIs(projectId, req.user);
        const scurve = await service.getProjectSCurve(projectId, req.user);
        
        res.json({
            success: true,
            data: {
                ...kpis,
                scurve
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function getProductivityDetails(req, res) {
    try {
        const { projectId } = req.params;
        const metrics = await service.getResourceUtilization(projectId, req.user);
        res.json({ success: true, data: metrics });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function getResourceTrends(req, res, next) {
    try {
        const data = await service.getResourceTrends(req.params.projectId, req.user);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

async function getCostAnalysis(req, res) {
    try {
        const { projectId } = req.params;
        const kpis = await service.getProjectKPIs(projectId, req.user);
        // Cost analysis specifically focuses on the budget section
        res.json({ success: true, data: kpis.budget });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

module.exports = {
    getDashboardMetrics,
    getProductivityDetails,
    getCostAnalysis,
    getResourceTrends
};
