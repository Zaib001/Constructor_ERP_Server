"use strict";

const prisma = require("../../db");
const { requestApproval } = require("../approvals/approvals.service");
const { registerAdapter } = require("../approvals/approvals.adapter");

// ─── Approval Adapter ─────────────────────────────────────────────────────────
registerAdapter('INSPECTION', async ({ docId, status }) => {
    const result = status === 'approved' ? 'PASS' : 'FAIL';
    await prisma.inspection.update({
        where: { id: docId },
        data: { result, status: 'approved', actual_date: new Date() }
    });
});

registerAdapter('INSPECTION:meta', async ({ docId }) => {
    const inspection = await prisma.inspection.findUnique({
        where: { id: docId }, include: { wbs: true }
    });
    if (!inspection) return null;
    return {
        title: `Site Inspection: ${inspection.insp_no} / ${inspection.activity}`,
        amount: 0, currency: '',
        meta: { Type: inspection.inspection_type, WBS: inspection.wbs?.name || 'Various' }
    };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Convert YYYY-MM-DD or ISO string to a proper Date for Prisma @db.Date fields */
function coerceDate(val) {
    if (!val) return undefined;
    if (val instanceof Date) return val;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(val))) return new Date(String(val) + 'T12:00:00.000Z');
    return new Date(val);
}

/** Strip empty-string UUID fields so Prisma doesn't reject '' as an invalid UUID */
function cleanUUIDs(obj, fields) {
    const out = { ...obj };
    for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(out, f)) {
            if (!out[f] || String(out[f]).trim() === '') delete out[f];
        }
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITP PLAN
// ─────────────────────────────────────────────────────────────────────────────

async function createITPPlan(data, userId, companyId) {
    const clean = cleanUUIDs(
        { ...data, company_id: companyId, created_by: userId },
        ['wbs_id']
    );
    return prisma.iTPPlan.create({ data: clean });
}

async function getProjectITPs(projectId, companyId) {
    return prisma.iTPPlan.findMany({
        where: { project_id: projectId, company_id: companyId },
        include: {
            wbs: true,
            inspections: {
                orderBy: { created_at: 'desc' },
                select: { id: true, result: true, status: true, insp_no: true, scheduled_date: true }
            }
        },
        orderBy: { created_at: 'desc' }
    });
}

/**
 * Change ITP status: active | suspended | closed
 */
async function updateITPStatus(itpId, status, companyId) {
    return prisma.iTPPlan.update({
        where: { id: itpId },
        data: { status }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// INSPECTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function createInspection(data, userId, companyId) {
    const { scheduled_date, ...rest } = data;

    let clean = cleanUUIDs(
        { ...rest, company_id: companyId, created_by: userId, scheduled_date: coerceDate(scheduled_date) },
        ['itp_plan_id', 'wbs_id', 'item_id', 'rfi_id']
    );

    // Auto-fill from linked ITP
    if (clean.itp_plan_id) {
        const itp = await prisma.iTPPlan.findUnique({ where: { id: clean.itp_plan_id } });
        if (itp) {
            clean.project_id = itp.project_id;
            if (!clean.wbs_id && itp.wbs_id) clean.wbs_id = itp.wbs_id;
        }
    }

    const inspection = await prisma.inspection.create({ data: clean });

    // Trigger approval workflow — non-blocking
    try {
        await requestApproval({
            docType: 'INSPECTION', docId: inspection.id,
            projectId: inspection.project_id, amount: 0,
            items: [{ itemName: inspection.activity, quantity: 1, unit: 'Lot' }]
        }, userId, 'SYSTEM', 'ERP-QC-MANAGER');
    } catch (e) {
        console.warn('[QC] Approval workflow skipped:', e.message);
    }

    return inspection;
}

async function getProjectInspections(projectId, companyId) {
    return prisma.inspection.findMany({
        where: { project_id: projectId, company_id: companyId },
        orderBy: { created_at: 'desc' },
        include: { itp_plan: { select: { id: true, itp_no: true, title: true } }, wbs: { select: { id: true, name: true } } }
    });
}

/**
 * Record inspection result (Pass / Fail / Conditional).
 * On FAIL — auto-raises an NCR linked to this inspection.
 */
async function recordInspectionResult(inspectionId, { result, observations, witness }, userId) {
    if (!['PASS', 'FAIL', 'CONDITIONAL'].includes(result)) {
        throw new Error(`Invalid result value: ${result}. Must be PASS, FAIL, or CONDITIONAL.`);
    }

    const updated = await prisma.inspection.update({
        where: { id: inspectionId },
        data: {
            result,
            observations,
            witness: witness || undefined,
            status:      result === 'PASS' ? 'completed' : result === 'FAIL' ? 'failed' : 'conditional',
            actual_date: new Date(),
            inspector:   userId,
        },
        include: { itp_plan: true, project: true }
    });

    // Auto-NCR on FAIL
    let autoNcr = null;
    if (result === 'FAIL') {
        autoNcr = await prisma.nCR.create({
            data: {
                ncr_no:        `NCR-AUTO-${Date.now()}`,
                project_id:    updated.project_id,
                company_id:    updated.project.company_id,
                inspection_id: updated.id,
                wbs_id:        updated.wbs_id || undefined,
                title:         `Auto-NCR: Inspection ${updated.insp_no} FAILED`,
                description:   observations || `Inspection ${updated.insp_no} did not meet acceptance criteria.`,
                category:      'WORKMANSHIP',
                severity:      'MAJOR',
                raised_by:     userId,
                created_by:    userId,
                raised_date:   new Date(),
                status:        'open',
            }
        });
    }

    return { inspection: updated, autoNcr };
}

async function updateInspectionResult(inspectionId, result, observations, userId) {
    return recordInspectionResult(inspectionId, { result, observations }, userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// NCR
// ─────────────────────────────────────────────────────────────────────────────

async function createNCR(data, userId, companyId) {
    const { raised_date, ...rest } = data;
    const clean = cleanUUIDs(
        {
            ...rest,
            company_id:  companyId,
            created_by:  userId,
            raised_by:   userId,
            raised_date: coerceDate(raised_date) || new Date(),
        },
        ['wbs_id', 'inspection_id']
    );
    return prisma.nCR.create({ data: clean });
}

async function getProjectNCRs(projectId, companyId) {
    return prisma.nCR.findMany({
        where: { project_id: projectId, company_id: companyId },
        orderBy: { created_at: 'desc' },
        include: {
            inspection: { select: { id: true, insp_no: true } },
            wbs:        { select: { id: true, name: true } }
        }
    });
}

/**
 * NCR Lifecycle: open → under_review → action_issued → closed
 */
async function updateNCRStatus(ncrId, { status, corrective_action, preventive_action, responsible, target_close, attachments }, userId) {
    const valid = ['open', 'under_review', 'action_issued', 'closed'];
    if (!valid.includes(status)) throw new Error(`Invalid NCR status: ${status}`);

    const ncr = await prisma.nCR.findUnique({ where: { id: ncrId } });
    if (!ncr) throw new Error('NCR not found');

    const data = { status };
    if (corrective_action) data.corrective_action = corrective_action;
    if (preventive_action) data.preventive_action = preventive_action;
    if (responsible)       data.responsible = responsible;
    if (target_close)      data.target_close = coerceDate(target_close);
    if (attachments)       data.attachments = attachments;

    if (status === 'closed') {
        // Industry Standard Gate: NCR cannot be closed without evidence attachments and corrective actions
        if (!ncr.corrective_action && !corrective_action) {
            throw new Error('Govenance Alert: Corrective action must be documented before formal NCR closure.');
        }
        if (!attachments && !ncr.attachments) {
            throw new Error('Govenance Alert: Evidence (attachments) is mandatory for closing a Quality Non-Conformance.');
        }
        data.actual_close = new Date();
    }

    return prisma.nCR.update({ where: { id: ncrId }, data });
}

// ─────────────────────────────────────────────────────────────────────────────
// QUALITY SUMMARY DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

async function getProjectQualitySummary(projectId, companyId) {
    const [inspections, ncrs, itpsCount] = await Promise.all([
        prisma.inspection.findMany({
            where: { project_id: projectId, company_id: companyId },
            include: { wbs: true }
        }),
        prisma.nCR.findMany({
            where: { project_id: projectId, company_id: companyId },
            orderBy: { raised_date: 'desc' }
        }),
        prisma.iTPPlan.count({
            where: { project_id: projectId, company_id: companyId, status: 'active' }
        })
    ]);

    const passCount  = inspections.filter(i => i.result === 'PASS').length;
    const failCount  = inspections.filter(i => i.result === 'FAIL').length;
    const openNCRs   = ncrs.filter(n => n.status === 'open').length;

    const ncrSeverity = {
        CRITICAL: ncrs.filter(n => n.severity === 'CRITICAL' && n.status === 'open').length,
        MAJOR:    ncrs.filter(n => n.severity === 'MAJOR'    && n.status === 'open').length,
        MINOR:    ncrs.filter(n => n.severity === 'MINOR'    && n.status === 'open').length,
    };

    const ncrData = [
        { name: 'Critical', value: ncrSeverity.CRITICAL, color: '#dc2626' },
        { name: 'Major',    value: ncrSeverity.MAJOR,    color: '#ea580c' },
        { name: 'Minor',    value: ncrSeverity.MINOR,    color: '#facc15' },
    ].filter(d => d.value > 0);

    // Dynamic Trend Logic: Last 8 weeks based on actual calendar days
    const trendData = [];
    const now = new Date();
    for (let w = 7; w >= 0; w--) {
        const start = new Date(now);
        start.setDate(now.getDate() - (w + 1) * 7);
        const end = new Date(now);
        end.setDate(now.getDate() - w * 7);

        const wInspections = inspections.filter(i => {
           const d = new Date(i.actual_date || i.created_at);
           return d >= start && d <= end;
        });

        trendData.push({
            name: `W${8-w}`,
            pass: wInspections.filter(i => i.result === 'PASS').length,
            fail: wInspections.filter(i => i.result === 'FAIL').length,
            total: wInspections.length
        });
    }

    const pending_actions = inspections
        .filter(i => ['pending', 'scheduled'].includes(i.status))
        .slice(0, 5)
        .map(i => ({
            id: i.id, title: i.activity, wbs: i.wbs?.name || 'GEN',
            type: i.inspection_type,
            priority: i.inspection_type === 'WITNESS' ? 'High' : 'Medium',
            time: `Due: ${i.scheduled_date ? new Date(i.scheduled_date).toLocaleDateString() : 'TBD'}`
        }));

    const closed_ncrs = ncrs
        .filter(n => n.status === 'closed')
        .slice(0, 5)
        .map(n => ({
            id: n.id, title: n.title, code: n.ncr_no,
            closedDate: n.actual_close ? new Date(n.actual_close).toLocaleDateString() : '—'
        }));

    return {
        total_inspections: inspections.length,
        pass_count: passCount, 
        fail_count: failCount,
        active_itps: itpsCount,
        pass_rate:  inspections.length > 0 ? ((passCount / inspections.length) * 100).toFixed(1) : 0,
        fail_rate:  inspections.length > 0 ? ((failCount / inspections.length) * 100).toFixed(1) : 0,
        open_ncrs:  openNCRs,
        closed_ncrs_count: ncrs.filter(n => n.status === 'closed').length,
        compliance_status: openNCRs > 5 ? 'CRITICAL' : openNCRs > 0 ? 'WARNING' : 'HEALTHY',
        ncrData, 
        trendData, 
        pending_actions, 
        closed_ncrs
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUALITY GATE (called by DPR submit)
// ─────────────────────────────────────────────────────────────────────────────

async function checkQualityGate(projectId, wbsId, tx = prisma) {
    const itp = await tx.iTPPlan.findFirst({
        where: { project_id: projectId, wbs_id: wbsId, status: 'active', blocking_enabled: true }
    });
    if (!itp) return true;

    const lastInspection = await tx.inspection.findFirst({
        where: { itp_plan_id: itp.id },
        orderBy: { created_at: 'desc' }
    });

    if (!lastInspection || lastInspection.result !== 'PASS') {
        throw new Error(
            `QUALITY GATE BLOCKED: "${itp.title}" requires a PASS inspection before daily progress can be reported.`
        );
    }
    return true;
}

/**
 * Compliance Check for UI visibility
 */
async function getWBSCompliance(projectId, wbsId) {
    const [itp, lastInspection, isSafe] = await Promise.all([
        prisma.iTPPlan.findFirst({ where: { project_id: projectId, wbs_id: wbsId, status: 'active' } }),
        prisma.inspection.findFirst({
            where: { project_id: projectId, wbs_id: wbsId },
            orderBy: { created_at: 'desc' }
        }),
        require('../hse/hse.service').isWBSActivitySafe(wbsId)
    ]);

    return {
        safe: isSafe,
        quality: {
            itp_required: !!itp,
            itp_blocked: itp?.blocking_enabled || false,
            last_result: lastInspection?.result || 'PENDING',
            last_no: lastInspection?.insp_no || null,
            passed: !itp || (lastInspection?.result === 'PASS')
        },
        fully_compliant: isSafe && (!itp || lastInspection?.result === 'PASS')
    };
}

module.exports = {
    // ITP
    createITPPlan, getProjectITPs, updateITPStatus,
    // Inspections
    createInspection, getProjectInspections, recordInspectionResult, updateInspectionResult,
    // NCR
    createNCR, getProjectNCRs, updateNCRStatus,
    // Dashboard
    getProjectQualitySummary,
    // Gate
    checkQualityGate, getWBSCompliance
};
