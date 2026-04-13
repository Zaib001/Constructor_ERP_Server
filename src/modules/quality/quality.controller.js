"use strict";

const service = require("./quality.service");

// ── GET handlers ──────────────────────────────────────────────────────────────

async function getProjectQualitySummary(req, res) {
    try {
        const data = await service.getProjectQualitySummary(req.params.projectId, req.user.companyId);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[QC] getProjectQualitySummary error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

async function getITPs(req, res) {
    try {
        const data = await service.getProjectITPs(req.params.projectId, req.user.companyId);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[QC] getITPs error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

async function getInspections(req, res) {
    try {
        const data = await service.getProjectInspections(req.params.projectId, req.user.companyId);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[QC] getInspections error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

async function getNCRs(req, res) {
    try {
        const data = await service.getProjectNCRs(req.params.projectId, req.user.companyId);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[QC] getNCRs error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

// ── CREATE handlers ───────────────────────────────────────────────────────────

async function createITP(req, res) {
    try {
        const data = await service.createITPPlan(req.body, req.user.id, req.user.companyId);
        res.status(201).json({ success: true, data });
    } catch (err) {
        console.error('[QC] createITP error:', err.message, '\nPayload:', JSON.stringify(req.body));
        res.status(500).json({ success: false, message: err.message, detail: err.meta || null });
    }
}

async function createInspection(req, res) {
    try {
        const data = await service.createInspection(req.body, req.user.id, req.user.companyId);
        res.status(201).json({ success: true, data });
    } catch (err) {
        console.error('[QC] createInspection error:', err.message, '\nPayload:', JSON.stringify(req.body));
        res.status(500).json({ success: false, message: err.message, detail: err.meta || null });
    }
}

async function createNCR(req, res) {
    try {
        const data = await service.createNCR(req.body, req.user.id, req.user.companyId);
        res.status(201).json({ success: true, data });
    } catch (err) {
        console.error('[QC] createNCR error:', err.message, '\nPayload:', JSON.stringify(req.body));
        res.status(500).json({ success: false, message: err.message, detail: err.meta || null });
    }
}

// ── UPDATE / LIFECYCLE handlers ───────────────────────────────────────────────

/** Record inspection result: Pass / Fail / Conditional */
async function recordInspectionResult(req, res) {
    try {
        const { result, observations, witness } = req.body;
        if (!result) return res.status(400).json({ success: false, message: 'result is required (PASS | FAIL | CONDITIONAL)' });
        const data = await service.recordInspectionResult(req.params.id, { result, observations, witness }, req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[QC] recordInspectionResult error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

/** Update inspection (legacy compat) */
async function updateInspection(req, res) {
    try {
        const { result, observations } = req.body;
        const data = await service.recordInspectionResult(req.params.id, { result, observations }, req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[QC] updateInspection error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

/** Update NCR lifecycle status + corrective/preventive action */
async function updateNCRStatus(req, res) {
    try {
        const { status, corrective_action, preventive_action, responsible, target_close } = req.body;
        if (!status) return res.status(400).json({ success: false, message: 'status is required' });
        const data = await service.updateNCRStatus(
            req.params.id,
            { status, corrective_action, preventive_action, responsible, target_close },
            req.user.id
        );
        res.json({ success: true, data });
    } catch (err) {
        console.error('[QC] updateNCRStatus error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

/** Update ITP status: active | suspended | closed */
async function updateITPStatus(req, res) {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, message: 'status is required' });
        const data = await service.updateITPStatus(req.params.id, status, req.user.companyId);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[QC] updateITPStatus error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

async function getWBSCompliance(req, res) {
    try {
        const data = await service.getWBSCompliance(req.query.projectId, req.params.wbsId);
        res.json({ success: true, data });
    } catch (err) {
        console.error('[QC] getWBSCompliance error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

module.exports = {
    getProjectQualitySummary, getITPs, getInspections, getNCRs,
    createITP, createInspection, createNCR,
    recordInspectionResult, updateInspection,
    updateNCRStatus, updateITPStatus,
    getWBSCompliance,
};
