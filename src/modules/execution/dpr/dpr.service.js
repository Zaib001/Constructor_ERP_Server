const prisma = require('../../../db');
const { Prisma } = require('@prisma/client');
const { registerAdapter } = require('../../approvals/approvals.adapter');
const { requestApproval } = require('../../approvals/approvals.service');
const { updateCostCodeActual, recomputeProjectProgress } = require('../../wbs/wbs.service');
const logger = require('../../../logger');
const qualityService = require('../../quality/quality.service');
const hseService = require('../../hse/hse.service');


// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateDPRNo(projectCode, date) {
  const d = new Date(date);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `DPR-${projectCode || 'PRJ'}-${ymd}-${Date.now().toString().slice(-4)}`;
}

function calcRiskLevel(score) {
  if (score >= 20) return 'CRITICAL';
  if (score >= 12) return 'HIGH';
  if (score >= 6)  return 'MEDIUM';
  return 'LOW';
}

// ─── Create DPR ───────────────────────────────────────────────────────────────
async function createDPR(data, userId, companyId) {
  const { 
    project_id, report_date, weather, shift, executive_summary, safety_note, remarks, 
    items = [], labor_logs = [], equipment_logs = [], material_issue_ids = [],
    link_resource_ids = [], hindrance_ids = [] 
  } = data;

  // Validate no duplicate DPR for same date+project+shift (Industry Standard)
  const existing = await prisma.dPR.findFirst({
    where: { 
      project_id, 
      report_date: new Date(report_date), 
      shift: shift || 'day',
      deleted_at: null 
    }
  });
  if (existing) {
    const err = new Error(`DPR for this ${shift || 'day'} shift already exists: ${existing.dpr_no}`);
    err.dpr_id = existing.id;
    err.status = existing.status;
    throw err;
  }

  const project = await prisma.project.findFirst({ where: { id: project_id, company_id: companyId } });
  if (!project) throw new Error('Project not found');

  const dpr_no = generateDPRNo(project.code, report_date);

  const dpr = await prisma.$transaction(async (tx) => {
    // 1. Create DPR header
    const dpr = await tx.dPR.create({
      data: {
        company_id: companyId,
        project_id,
        dpr_no,
        report_date: new Date(report_date),
        weather,
        shift: shift || 'day',
        status: 'draft',
        executive_summary,
        safety_note,
        remarks,
        created_by: userId,
      }
    });

    // 2. Create DPR items (per WBS activity)
    for (const item of items) {
      const { wbs_id, boq_item_id, description, unit, planned_today_qty, actual_today_qty, remarks: iRemark } = item;

      // 2.1 Quality & Safety Gate Check
      if (Number(actual_today_qty || 0) > 0) {
        await qualityService.checkQualityGate(project_id, wbs_id, tx);
        
        // Safety Gate: JSA must be approved
        const isSafe = await hseService.isWBSActivitySafe(wbs_id);
        if (!isSafe) {
          throw new Error(`Industrial Governance Block: Missing JSA Approval. Please submit and approve a JSA for this WBS activity before recording execution logs.`);
        }
      }

      // Get cumulative actual from previous DPRs
      const prevActual = await tx.dPRItem.aggregate({
        where: { wbs_id, dpr: { project_id, deleted_at: null, id: { not: dpr.id } } },
        _sum: { actual_today_qty: true }
      });
      const cumulative_actual = Number(prevActual?._sum?.actual_today_qty || 0) + Number(actual_today_qty || 0);

      // Get BOQ planned qty for progress %
      let boq_planned = 0;
      if (boq_item_id) {
        const boq = await tx.bOQItem.findUnique({ where: { id: boq_item_id } });
        boq_planned = boq ? Number(boq.planned_qty) : 0;
      } else {
        const wbs = await tx.wBS.findUnique({ where: { id: wbs_id } });
        boq_planned = wbs ? Number(wbs.planned_qty || 0) : 0;
      }

      const progress_pct = boq_planned > 0 ? Math.min(100, (cumulative_actual / boq_planned) * 100) : 0;

      await tx.dPRItem.create({
        data: {
          dpr_id: dpr.id,
          wbs_id,
          boq_item_id,
          description,
          unit,
          planned_today_qty: Number(planned_today_qty || 0),
          actual_today_qty: Number(actual_today_qty || 0),
          cumulative_planned: Number(planned_today_qty || 0),
          cumulative_actual,
          progress_pct: Number(progress_pct.toFixed(2)),
          remarks: iRemark,
        }
      });

      // WBS update removed from here (Deferred until approval)
    }

    // 3. Create Labor logs
    for (const log of labor_logs) {
      const { employee_id, trade, headcount, hours_worked, overtime_hrs, daily_rate, wbs_id: log_wbs } = log;
      const labor_cost = (Number(headcount || 1) * Number(hours_worked || 8) / 8) * Number(daily_rate || 0);
      await tx.resourceLog.create({
        data: {
          company_id: companyId,
          project_id,
          dpr_id: dpr.id,
          resource_type: 'LABOR',
          employee_id,
          trade,
          headcount: Number(headcount || 1),
          hours_worked: Number(hours_worked || 8),
          overtime_hrs: Number(overtime_hrs || 0),
          daily_rate: Number(daily_rate || 0),
          labor_cost: Number(labor_cost.toFixed(2)),
          wbs_id: log_wbs,
          created_by: userId,
        }
      });

      // Update CostCode actual_amount for labor
      if (log_wbs) {
        await updateCostCodeActual(tx, log_wbs, 'labor', labor_cost);
      }
    }

    // 4. Create Equipment logs
    for (const log of equipment_logs) {
      const { equipment_id, equipment_no, hours_used, idle_hours, hire_rate, fuel_consumed, wbs_id: log_wbs } = log;
      const equip_cost = Number(hours_used || 0) * Number(hire_rate || 0);
      await tx.resourceLog.create({
        data: {
          company_id: companyId,
          project_id,
          dpr_id: dpr.id,
          resource_type: 'EQUIPMENT',
          equipment_id,
          equipment_no,
          hours_used: Number(hours_used || 0),
          idle_hours: Number(idle_hours || 0),
          hire_rate: Number(hire_rate || 0),
          fuel_consumed: Number(fuel_consumed || 0),
          equip_cost: Number(equip_cost.toFixed(2)),
          wbs_id: log_wbs,
          created_by: userId,
        }
      });

      if (log_wbs) {
        await updateCostCodeActual(tx, log_wbs, 'equipment', equip_cost);
      }
    }

    // 5. Link Existing Resource Logs (from Site Hub Clock-In)
    const validLinkIds = link_resource_ids.filter(id => id && id.length === 36); // Basic UUID length check
    if (validLinkIds.length > 0) {
      await tx.resourceLog.updateMany({
        where: { id: { in: validLinkIds }, company_id: companyId },
        data: { dpr_id: dpr.id }
      });
    }

    // 6. Link material issues
    for (const issue_id of material_issue_ids) {
      const issue = await tx.materialIssue.findFirst({
        where: { id: issue_id, project_id, company_id: companyId },
        include: { items: true }
      });
      if (!issue) continue;
      const total_cost = issue.items.reduce((s, i) => s + Number(i.unit_cost) * Number(i.quantity), 0);
      await tx.dPRMaterialLink.upsert({
        where: { dpr_id_issue_id: { dpr_id: dpr.id, issue_id } },
        create: { dpr_id: dpr.id, issue_id, total_cost },
        update: { total_cost }
      });
    }

    // 8. Link hindrances
    const validHindranceIds = (hindrance_ids || []).filter(id => id && id.length === 36);
    if (validHindranceIds.length > 0) {
      await tx.hindranceLog.updateMany({
        where: { id: { in: validHindranceIds }, company_id: companyId },
        data: { dpr_id: dpr.id }
      });
    }

    // 9. Recompute project-level weighted progress (Only for Drafts/Initial creation)
    await recomputeProjectProgress(tx, project_id);

    return dpr;
  });

  return getDPRById(dpr.id, companyId);
}

async function updateDPR(id, data, userId, companyId) {
  const { 
    weather, shift, executive_summary, safety_note, remarks, 
    items = [], labor_logs = [], equipment_logs = [], material_issue_ids = [],
    link_resource_ids = [], hindrance_ids = [] 
  } = data;

  const dpr = await prisma.dPR.findFirst({
    where: { id, company_id: companyId, deleted_at: null }
  });

  if (!dpr) throw new Error('DPR not found');
  if (dpr.status !== 'draft') throw new Error(`Cannot edit ${dpr.status} DPR`);

  return prisma.$transaction(async (tx) => {
    // 1. Update Header
    await tx.dPR.update({
      where: { id },
      data: { weather, shift, executive_summary, safety_note, remarks }
    });

    // Handle linkage of hindrances in update too
    if (Array.isArray(hindrance_ids)) {
        await tx.hindranceLog.updateMany({
            where: { id: { in: hindrance_ids }, company_id: companyId },
            data: { dpr_id: id }
        });
    }

    // 2. Refresh Items (Atomic)
    await tx.dPRItem.deleteMany({ where: { dpr_id: id } });
    for (const item of items) {
      const { wbs_id, boq_item_id, description, unit, planned_today_qty, actual_today_qty, remarks: iRemark } = item;
      
      const prevActual = await tx.dPRItem.aggregate({
        where: { wbs_id, dpr: { project_id: dpr.project_id, deleted_at: null, id: { not: id } } },
        _sum: { actual_today_qty: true }
      });
      const cumulative_actual = Number(prevActual?._sum?.actual_today_qty || 0) + Number(actual_today_qty || 0);

      let boq_planned = 0;
      if (boq_item_id) {
        const boq = await tx.bOQItem.findUnique({ where: { id: boq_item_id } });
        boq_planned = boq ? Number(boq.planned_qty) : 0;
      } else {
        const wbs = await tx.wBS.findUnique({ where: { id: wbs_id } });
        boq_planned = wbs ? Number(wbs.planned_qty || 0) : 0;
      }

      const progress_pct = boq_planned > 0 ? Math.min(100, (cumulative_actual / boq_planned) * 100) : 0;
      
      // Quality & Safety Gate Check (Industry Standard)
      if (Number(actual_today_qty || 0) > 0) {
        await qualityService.checkQualityGate(dpr.project_id, wbs_id, tx);

        // Safety Gate: JSA must be approved
        const isSafe = await hseService.isWBSActivitySafe(wbs_id);
        if (!isSafe) {
          throw new Error(`Industrial Governance Block: Missing JSA Approval. An approved JSA is required before updates are permitted for this activity.`);
        }
      }

      await tx.dPRItem.create({
        data: {
          dpr_id: id,
          wbs_id,
          description,
          unit,
          planned_today_qty: Number(planned_today_qty || 0),
          actual_today_qty: Number(actual_today_qty || 0),
          cumulative_planned: Number(planned_today_qty || 0),
          cumulative_actual,
          progress_pct: Number(progress_pct.toFixed(2)),
          remarks: iRemark
        }
      });
    }

    // 3. Refresh Resources
    // Strategy: Decouple all linked to this DPR, then re-link/re-create
    await tx.resourceLog.updateMany({
      where: { dpr_id: id },
      data: { dpr_id: null }
    });
    // Delete manual logs that were created for this DPR (no check_in_at)
    await tx.resourceLog.deleteMany({
      where: { dpr_id: null, check_in_at: null, project_id: dpr.project_id, company_id: companyId }
    });

    // Create New Manual Labor Logs
    for (const log of labor_logs) {
      const { employee_id, trade, headcount, hours_worked, overtime_hrs, daily_rate, wbs_id: log_wbs } = log;
      const labor_cost = (Number(headcount || 1) * Number(hours_worked || 8) / 8) * Number(daily_rate || 0);
      await tx.resourceLog.create({
        data: {
          company_id: companyId,
          project_id: dpr.project_id,
          dpr_id: id,
          resource_type: 'LABOR',
          employee_id,
          trade,
          headcount: Number(headcount || 1),
          hours_worked: Number(hours_worked || 8),
          overtime_hrs: Number(overtime_hrs || 0),
          daily_rate: Number(daily_rate || 0),
          labor_cost: Number(labor_cost.toFixed(2)),
          wbs_id: log_wbs,
          created_by: userId
        }
      });
      if (log_wbs) await updateCostCodeActual(tx, log_wbs, 'labor', labor_cost);
    }

    // Create New Manual Equipment Logs
    for (const log of equipment_logs) {
      const { equipment_id, equipment_no, hours_used, idle_hours, hire_rate, wbs_id: log_wbs } = log;
      const equip_cost = Number(hours_used || 0) * Number(hire_rate || 0);
      await tx.resourceLog.create({
        data: {
          company_id: companyId,
          project_id: dpr.project_id,
          dpr_id: id,
          resource_type: 'EQUIPMENT',
          equipment_id,
          equipment_no,
          hours_used: Number(hours_used || 0),
          idle_hours: Number(idle_hours || 0),
          hire_rate: Number(hire_rate || 0),
          equip_cost: Number(equip_cost.toFixed(2)),
          wbs_id: log_wbs,
          created_by: userId
        }
      });
      if (log_wbs) await updateCostCodeActual(tx, log_wbs, 'equipment', equip_cost);
    }

    // Link Site Hub Resources
    const validLinkIds = link_resource_ids.filter(id => id && id.length === 36);
    if (validLinkIds.length > 0) {
      await tx.resourceLog.updateMany({
        where: { id: { in: validLinkIds }, company_id: companyId },
        data: { dpr_id: id }
      });
    }

    // 4. Refresh Materials
    await tx.dPRMaterialLink.deleteMany({ where: { dpr_id: id } });
    for (const issue_id of material_issue_ids) {
      const issue = await tx.materialIssue.findFirst({
        where: { id: issue_id, project_id: dpr.project_id, company_id: companyId },
        include: { items: true }
      });
      if (issue) {
        const total_cost = issue.items.reduce((sum, it) => sum + (Number(it.quantity) * Number(it.unit_cost)), 0);
        await tx.dPRMaterialLink.create({
          data: { dpr_id: id, issue_id, total_cost }
        });
      }
    }

    // 5. Recompute
    await recomputeProjectProgress(tx, dpr.project_id);

    return id;
  });
}


// ─── Submit DPR ───────────────────────────────────────────────────────────────
async function submitDPR(dpr_id, userId, companyId) {
  const dpr = await prisma.dPR.findFirst({ 
    where: { id: dpr_id, company_id: companyId, deleted_at: null },
    include: { items: true }
  });
  if (!dpr) throw new Error('DPR not found');
  if (dpr.status !== 'draft') throw new Error(`DPR is already ${dpr.status}`);

  // Final Quality & Safety Gate Check on Submission
  for (const item of dpr.items) {
      if (Number(item.actual_today_qty || 0) > 0) {
          await qualityService.checkQualityGate(dpr.project_id, item.wbs_id);
          
          const isSafe = await hseService.isWBSActivitySafe(item.wbs_id);
          if (!isSafe) {
            throw new Error(`Industrial Governance Block: Missing JSA Approval. The safety analysis for this WBS activity has not been authorized.`);
          }
      }
  }

  // Initiate Centralized Approval Request
  const approvalData = {
    docType: 'DPR',
    docId: dpr.id,
    projectId: dpr.project_id,
    amount: 0, // DPR doesn't have a direct monetary value for matrix, but can be added if needed
    items: dpr.items.map(it => ({
      itemName: it.description,
      quantity: Number(it.actual_today_qty || 0),
      unit: it.unit
    }))
  };

  await requestApproval(approvalData, userId, 'SYSTEM', 'ERP-SITE-ENGINEER');

  return prisma.dPR.update({
    where: { id: dpr_id },
    data: { status: 'submitted', submitted_by: userId, submitted_at: new Date() }
  });
}

// ─── Review / Approve DPR ─────────────────────────────────────────────────────
async function reviewDPR(dpr_id, action, userId, companyId) {
  return prisma.$transaction(async (tx) => {
    // If companyId is null/undefined, we trust the caller (e.g. Adapter) to have unique doc ID
    const dpr = await tx.dPR.findFirst({ 
      where: { 
        id: dpr_id, 
        ...(companyId && { company_id: companyId }),
        deleted_at: null 
      },
      include: { items: true }
    });
    
    if (!dpr) throw new Error('DPR not found or access denied');
    
    // Safety: If already approved/rejected, don't repeat (no-op)
    const targetStatus = action === 'approve' ? 'approved' : 'rejected';
    if (dpr.status === targetStatus) return dpr;

    if (dpr.status !== 'submitted' && dpr.status !== 'draft') {
        throw new Error(`DPR in ${dpr.status} status cannot be reviewed`);
    }

    const result = await tx.dPR.update({
      where: { id: dpr_id },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: userId,
        reviewed_at: new Date()
      }
    });

    if (action === 'approve') {
      for (const item of dpr.items) {
        if (!item.wbs_id) continue;
        
        // Fetch current WBS state to calculate new progress
        const wbs = await tx.wBS.findUnique({ 
          where: { id: item.wbs_id }
        });

        if (!wbs) continue;

        const actual_today_qty = Number(item.actual_today_qty || 0);
        const new_total_actual = Number(wbs.actual_qty || 0) + actual_today_qty;
        const boq_planned = Number(wbs.planned_qty || 0);

        await tx.wBS.update({
          where: { id: item.wbs_id },
          data: {
            actual_qty: new_total_actual,
            progress_pct: boq_planned > 0
              ? Math.min(100, (new_total_actual / boq_planned) * 100)
              : undefined,
            actual_start: wbs.actual_start || dpr.report_date
          }
        });
      }
      
      // Industrial Finish: Trigger project overall progress update on approval
      await recomputeProjectProgress(tx, dpr.project_id);
    }

    return result;
  });
}

// ─── Get DPR by ID ────────────────────────────────────────────────────────────
async function getDPRById(id, companyId) {
  return prisma.dPR.findFirst({
    where: { id, company_id: companyId, deleted_at: null },
    include: {
      project: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, name: true } },
      submitter: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      items: {
        include: {
          wbs: { select: { id: true, name: true, wbs_code: true } }
        }
      },
      resource_logs: {
        include: {
          employee: { select: { id: true, name: true } },
          equipment: { select: { id: true, name: true, equipment_no: true } },
        }
      },
      hindrances: true,
      material_links: {
        include: {
          issue: {
            select: { id: true, issue_no: true, issued_at: true },
          }
        }
      }
    }
  });
}

// ─── List DPRs ────────────────────────────────────────────────────────────────
async function listDPRs({ project_id, status, from_date, to_date, page = 1, limit = 20 }, companyId) {
  const where = {
    company_id: companyId,
    deleted_at: null,
    ...(project_id && { project_id }),
    ...(status && { status }),
    ...(from_date || to_date ? {
      report_date: {
        ...(from_date && { gte: new Date(from_date) }),
        ...(to_date && { lte: new Date(to_date) })
      }
    } : {})
  };

  const [data, total] = await Promise.all([
    prisma.dPR.findMany({
      where,
      orderBy: { report_date: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        project: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, name: true } },
        _count: { select: { items: true, resource_logs: true } }
      }
    }),
    prisma.dPR.count({ where })
  ]);

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Delete DPR (soft) ────────────────────────────────────────────────────────
async function deleteDPR(id, companyId) {
  return prisma.dPR.update({
    where: { id },
    data: { deleted_at: new Date() }
  });
}

// ─── Approval Adapter Registration ─────────────────────────────────────────────
registerAdapter('DPR', async ({ docId, status, userId, companyId }) => {
  const dprId = docId;
  const targetStatus = status.toLowerCase(); // approved, rejected, sent_back -> draft

  // Admin approvals often come from a user with a Global/null companyId.
  // Since the DPR ID is a globally unique UUID, we can safely update by ID
  // while the engine handles the high-level authorization.
  
  if (targetStatus === 'approved') {
    // We call a "system" version or allow the review to proceed without strict company filtering
    // to fix the "Admin vs Global" mismatch reported by users.
    await reviewDPR(dprId, 'approve', userId, null); 
  } else if (targetStatus === 'rejected') {
    await reviewDPR(dprId, 'reject', userId, null);
  } else if (targetStatus === 'sent_back') {
      await prisma.dPR.update({
          where: { id: dprId },
          data: { status: 'draft' }
      });
  }
});

registerAdapter('DPR:meta', async ({ docId }) => {
    const dpr = await prisma.dPR.findUnique({
        where: { id: docId },
        include: { _count: { select: { items: true } } }
    });
    if (!dpr) return null;
    return {
        title: `Daily Progress Report: ${dpr.dpr_no}`,
        amount: 0,
        description: `Project progress for ${dpr.report_date.toLocaleDateString()}. ${dpr._count.items} activities logged.`
    };
});

/**
 * Fetch a summary of resources clocked in for a specific date and project
 * Used for auto-filling DPRs to reduce manual entry.
 */
async function getDailyResourceSummary(projectId, date, companyId) {
  const targetDate = new Date(date);
  const startOfDay = new Date(targetDate.setHours(0,0,0,0));
  const endOfDay = new Date(targetDate.setHours(23,59,59,999));

  const logs = await prisma.resourceLog.findMany({
    where: {
      project_id: projectId,
      company_id: companyId,
      check_in_at: {
        gte: startOfDay,
        lte: endOfDay
      }
    },
    include: {
      employee: { select: { id: true, name: true, designation: true } },
      equipment: { select: { id: true, name: true, equipment_no: true } }
    }
  });

  return {
    labor: logs.filter(l => l.resource_type === 'LABOR').map(l => ({
      employee_id: l.employee_id,
      name: l.employee?.name,
      designation: l.employee?.designation,
      check_in: l.check_in_at,
      check_out: l.check_out_at,
      hours: l.hours_worked
    })),
    equipment: logs.filter(l => l.resource_type === 'EQUIPMENT').map(l => ({
      equipment_id: l.equipment_id,
      name: l.equipment?.name,
      id_no: l.equipment?.equipment_no,
      check_in: l.check_in_at,
      check_out: l.check_out_at,
      hours: l.hours_used
    }))
  };
}

async function getDailyMissionSummary(projectId, date, companyId) {
  const targetDate = new Date(date);
  const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

  return prisma.executionTask.findMany({
    where: {
      project_id: projectId,
      company_id: companyId,
      status: "verified",
      verified_at: {
        gte: startOfDay,
        lte: endOfDay
      }
    },
    include: {
      wbs: { 
        select: { 
          id: true, 
          name: true, 
          wbs_code: true, 
          unit: true
        } 
      }
    }

  });
}

module.exports = { 
  createDPR, 
  updateDPR, 
  submitDPR, 
  reviewDPR, 
  getDPRById, 
  listDPRs, 
  deleteDPR,
  getDailyResourceSummary,
  getDailyMissionSummary
};

