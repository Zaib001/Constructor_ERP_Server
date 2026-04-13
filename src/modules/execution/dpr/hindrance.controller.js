const hindranceService = require('./hindrance.service');
const logger = require('../../../logger');

async function listHindrances(req, res) {
    try {
        const result = await hindranceService.listHindrances(req.query, req.user.companyId);
        res.json({ success: true, ...result });
    } catch (error) {
        logger.error(`Error listing hindrances: ${error.message}`);
        res.status(500).json({ success: false, message: error.message });
    }
}

async function createHindrance(req, res) {
    try {
        const result = await hindranceService.createHindrance(req.body, req.user.id, req.user.companyId);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error(`Error creating hindrance: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

async function resolveHindrance(req, res) {
    try {
        const result = await hindranceService.resolveHindrance(req.params.id, req.body, req.user.id, req.user.companyId);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`Error resolving hindrance: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
}

module.exports = {
    listHindrances,
    createHindrance,
    resolveHindrance
};
