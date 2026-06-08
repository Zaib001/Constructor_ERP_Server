"use strict";

const financeService = require("./finance.service");

/**
 * GET /api/projects/:projectId/finance/budget-vs-actual
 */
async function getBudgetVsActual(req, res, next) {
    try {
        const { projectId } = req.params;
        const { costCode, from, to } = req.query;

        // Validate date params
        if (from && isNaN(Date.parse(from))) {
            return res.status(400).json({ success: false, message: "Invalid 'from' date — must be ISO 8601." });
        }
        if (to && isNaN(Date.parse(to))) {
            return res.status(400).json({ success: false, message: "Invalid 'to' date — must be ISO 8601." });
        }

        const data = await financeService.getBudgetVsActual(req.user, {
            projectId,
            costCodeFilter: costCode || null,
            from: from ? new Date(from) : null,
            to:   to   ? new Date(to)   : null,
        });

        return res.status(200).json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

module.exports = { getBudgetVsActual };
