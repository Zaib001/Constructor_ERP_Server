const prisma = require('../../db');
const { Prisma } = require('@prisma/client');
const { registerAdapter } = require('../approvals/approvals.adapter');
const { requestApproval } = require('../approvals/approvals.service');

/**
 * Health, Safety & Environment (HSE) Service
 * ───────────────────────────────────────────────────────
 * Manages the lifecycle of safety inductions, incidents,
 * walkthrough logs, and Job Safety Analysis (JSA).
 * ───────────────────────────────────────────────────────
 */
const hseService = {
  // ─── Safety Incidents ───────────────────────────────────────────────────────
  createIncident: async (data, userId, companyId) => {
    const count = await prisma.safetyIncident.count({ where: { company_id: companyId } });
    const incident_no = `INC-${String(count + 1).padStart(5, '0')}`;
    
    // ISO Date strictly required for @db.Date
    const date = data.incident_date ? new Date(data.incident_date) : new Date();

    return prisma.safetyIncident.create({
      data: {
        ...data,
        company_id: companyId,
        incident_no,
        incident_date: date,
        created_by: userId,
        status: 'open'
      },
      include: { 
        involved_company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    });
  },

  listIncidents: async ({ project_id, category, status, company_id, page = 1, limit = 50 }, tenantId) => {
    const where = { 
      company_id: tenantId, 
      ...(project_id && { project_id }),
      ...(company_id && { involved_company_id: company_id }),
      ...(category && { category }),
      ...(status && { status })
    };

    const [data, total] = await Promise.all([
      prisma.safetyIncident.findMany({
        where,
        orderBy: { incident_date: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { 
          involved_company: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } }
        }
      }),
      prisma.safetyIncident.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  updateIncident: async (id, data) => {
    const incident = await prisma.safetyIncident.findUnique({ where: { id } });
    if (!incident) throw new Error('Safety Incident not found');

    const updates = { ...data };
    if (data.incident_date) updates.incident_date = new Date(data.incident_date);
    if (data.closed_at) updates.closed_at = new Date(data.closed_at);

    if (data.status === 'closed') {
      // Industry Standard Gate: Safety Incident cannot be closed without investigation and root cause analysis
      if (!incident.root_cause && !data.root_cause) {
        throw new Error('Compliance Gate: Root Cause Analysis (RCA) must be documented before incident closure.');
      }
      if (!incident.corrective_actions && !data.corrective_actions) {
        throw new Error('Compliance Gate: Corrective and Preventive Actions (CAPA) must be defined before resolution.');
      }
      if (!incident.attachments && !data.attachments) {
        throw new Error('Compliance Gate: Formal investigation report/evidence must be attached for archival closure.');
      }
      updates.investigation_complete = true;
      updates.closed_at = new Date();
    }

    return prisma.safetyIncident.update({
      where: { id },
      data: updates
    });
  },

  // ─── HSE Inductions ────────────────────────────────────────────────────────
  createInduction: async (data, userId, companyId) => {
    return prisma.hSEInduction.create({
      data: {
        ...data,
        company_id: companyId,
        created_by: userId,
        induction_date: new Date(data.induction_date),
        ...(data.valid_until && { valid_until: new Date(data.valid_until) })
      },
      include: { involved_company: { select: { id: true, name: true } } }
    });
  },

  listInductions: async ({ project_id, company_id, page = 1, limit = 50 }, tenantId) => {
    const where = { 
      company_id: tenantId,
      ...(project_id && { project_id }),
      ...(company_id && { involved_company_id: company_id })
    };

    const [data, total] = await Promise.all([
      prisma.hSEInduction.findMany({
        where,
        orderBy: { induction_date: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { involved_company: { select: { id: true, name: true } } }
      }),
      prisma.hSEInduction.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── Safety Logs (Walkthroughs) ─────────────────────────────────────────────
  createSafetyLog: async (data, userId, companyId) => {
    return prisma.safetyLog.create({
      data: {
        ...data,
        company_id: companyId,
        observer_id: userId,
        log_date: new Date(data.log_date || new Date())
      }
    });
  },

  listSafetyLogs: async ({ project_id, status, category, page = 1, limit = 50 }, tenantId) => {
    const where = { 
      company_id: tenantId,
      ...(project_id && { project_id }),
      ...(status && { status }),
      ...(category && { category })
    };

    const [data, total] = await Promise.all([
      prisma.safetyLog.findMany({
        where,
        orderBy: { log_date: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { observer: { select: { id: true, name: true } } }
      }),
      prisma.safetyLog.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  updateSafetyLog: async (id, data) => {
    const updates = { ...data };
    if (data.log_date) updates.log_date = new Date(data.log_date);
    if (data.closed_at) updates.closed_at = new Date(data.closed_at);

    return prisma.safetyLog.update({
      where: { id },
      data: updates
    });
  },

  // ─── Safety JSA (Job Safety Analysis) ───────────────────────────────────────
  createJSA: async (data, userId, companyId) => {
    const count = await prisma.safetyJSA.count({ where: { company_id: companyId } });
    const jsa_no = `JSA-${String(count + 1).padStart(5, '0')}`;

    const jsa = await prisma.safetyJSA.create({
      data: {
        ...data,
        company_id: companyId,
        jsa_no,
        created_by_id: userId,
        status: 'pending'
      },
      include: { 
        wbs: { select: { id: true, name: true, project_id: true } },
        creator: { select: { id: true, name: true } }
      }
    });

    // Integrated Approval Request
    try {
      await requestApproval({
        docType: 'JSA',
        docId: jsa.id,
        projectId: jsa.wbs?.project_id,
        amount: 0,
        title: `Job Safety Analysis: ${jsa_no}`,
        description: `JSA for activity: ${jsa.wbs?.name || 'Unknown'}`
      }, userId, 'SYSTEM', 'ERP-HSE-OFFICER');
    } catch (err) {
      console.error("Failed to trigger JSA approval:", err);
    }

    return jsa;
  },

  updateJSAStatus: async (id, { status, remarks }, userId) => {
    return prisma.safetyJSA.update({
      where: { id },
      data: {
        status,
        approved_by_id: userId,
        approved_at: new Date(),
        // We could log remarks in a separate history table if needed
      }
    });
  },

  listJSAs: async ({ project_id, wbs_id, status, page = 1, limit = 50 }, tenantId) => {
    const where = { 
      company_id: tenantId,
      ...(project_id && { project_id }),
      ...(wbs_id && { wbs_id }),
      ...(status && { status })
    };

    const [data, total] = await Promise.all([
      prisma.safetyJSA.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { 
          wbs: { select: { id: true, name: true, wbs_code: true } },
          creator: { select: { id: true, name: true } },
          approved_by: { select: { id: true, name: true } }
        }
      }),
      prisma.safetyJSA.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  /**
   * Safety Gate Check
   * Returns true if there is an APPROVED JSA for the specific WBS activity.
   */
  isWBSActivitySafe: async (wbsId) => {
    const jsas = await prisma.safetyJSA.findMany({
      where: {
        wbs_id: wbsId
      }
    });

    // If no JSA has ever been created for this WBS, we allow progress (Silent mode)
    if (jsas.length === 0) return true;

    // If JSAs exist, at least one must be approved
    const activeJSA = jsas.find(j => j.status === 'approved');
    return !!activeJSA;
  },

  // ─── Summary & Analytics ───────────────────────────────────────────────────
  getHSESummary: async (projectId, companyId) => {
    const [incidents, inductions, openObservations, totalManHours] = await Promise.all([
      prisma.safetyIncident.findMany({ where: { project_id: projectId, company_id: companyId } }),
      prisma.hSEInduction.count({ where: { project_id: projectId, company_id: companyId } }),
      prisma.safetyLog.count({ where: { project_id: projectId, company_id: companyId, status: 'open' } }),
      prisma.resourceLog.aggregate({
        where: { project_id: projectId, resource_type: 'LABOR' },
        _sum: { hours_worked: true }
      })
    ]);

    const lti = incidents.filter(i => i.category === 'LTI').length;
    const nearMiss = incidents.filter(i => i.category === 'NEAR_MISS').length;
    const firstAid = incidents.filter(i => i.category === 'FIRST_AID').length;
    
    // Real Safe Man Hours calculation: Total DB recorded hours
    const realSafeHours = Number(totalManHours._sum?.hours_worked || 0);

    // Calculate Safety Rating (Industrial formula: % of zero-harm shifts)
    // For now: (1 - (Incidents / (SafeHours/8 + 1))) * 100
    const safetyRating = realSafeHours > 0 
      ? Math.max(0, Math.min(100, (1 - (lti / (realSafeHours / 8 + 1))) * 100))
      : 100;

    return {
      total_incidents: incidents.length,
      lti_count: lti,
      near_miss_count: nearMiss,
      first_aid_count: firstAid,
      inductions_count: inductions,
      open_observations: openObservations,
      safe_man_hours: realSafeHours,
      safety_rating: safetyRating.toFixed(1),
      compliance_status: lti > 0 ? 'CRITICAL' : nearMiss > 2 ? 'WARNING' : 'HEALTHY'
    };
  }
};

module.exports = hseService;

// ─── Approval Adapter Registration ─────────────────────────────────────────────
registerAdapter('JSA', async ({ docId, status, userId, companyId }) => {
  const targetStatus = status.toLowerCase() === 'approved' ? 'approved' : 
                       status.toLowerCase() === 'sent_back' ? 'pending' : 'rejected';
  
  await prisma.safetyJSA.update({
    where: { id: docId },
    data: { 
      status: targetStatus,
      approved_by_id: targetStatus === 'approved' ? userId : undefined,
      approved_at: targetStatus === 'approved' ? new Date() : undefined
    }
  });
});

registerAdapter('JSA:meta', async ({ docId }) => {
    const jsa = await prisma.safetyJSA.findUnique({
        where: { id: docId },
        include: { wbs: { select: { name: true } } }
    });
    if (!jsa) return null;
    return {
        title: `JSA: ${jsa.jsa_no}`,
        amount: 0,
        description: `Safety analysis for ${jsa.wbs?.name || 'WBS Activity'}. Status: ${jsa.status.toUpperCase()}`
    };
});
