const prisma = require('../../db');
const { Prisma } = require('@prisma/client');

/**
 * Risk & Hindrance Management Service
 * ───────────────────────────────────────────────────────
 * Professional risk assessment (High/Medium/Low)
 * and site hindrance tracking.
 * ───────────────────────────────────────────────────────
 */
const riskService = {
  // ─── Risk Register ──────────────────────────────────────────────────────────
  createRisk: async (data, userId, companyId) => {
    const count = await prisma.riskRegister.count({ where: { company_id: companyId } });
    const risk_id_no = `RISK-${String(count + 1).padStart(5, '0')}`;
    
    const likelihood = Number(data.likelihood || 1);
    const impact = Number(data.impact || 1);
    const risk_score = likelihood * impact;
    
    // Industry Standard Level Mapping
    const risk_level = risk_score >= 15 ? 'CRITICAL' : 
                       risk_score >= 10 ? 'HIGH' : 
                       risk_score >= 5 ? 'MEDIUM' : 'LOW';

    const payloadDetails = { ...data };
    if (!payloadDetails.wbs_id) delete payloadDetails.wbs_id;
    if (!payloadDetails.owner_id) delete payloadDetails.owner_id;

    return prisma.riskRegister.create({
      data: {
        ...payloadDetails,
        company_id: companyId,
        risk_id_no,
        likelihood,
        impact,
        risk_score,
        risk_level,
        created_by: userId,
        review_date: data.review_date ? new Date(data.review_date) : null
      },
      include: {
        wbs: { select: { id: true, name: true, wbs_code: true } },
        owner: { select: { id: true, name: true } }
      }
    });
  },

  listRisks: async ({ project_id, wbs_id, category, risk_level, status, page = 1, limit = 50 }, tenantId) => {
    const where = {
      company_id: tenantId,
      ...(project_id && { project_id }),
      ...(wbs_id && { wbs_id }),
      ...(category && { category }),
      ...(risk_level && { risk_level }),
      ...(status && { status })
    };

    const [data, total] = await Promise.all([
      prisma.riskRegister.findMany({
        where,
        orderBy: [{ risk_score: 'desc' }, { created_at: 'desc' }],
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          wbs: { select: { id: true, name: true, wbs_code: true } },
          owner: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } }
        }
      }),
      prisma.riskRegister.count({ where })
    ]);

    // Heat Map Calculation (5x5 Matrix)
    const heatMap = Array.from({ length: 5 }, (_, li) => 
      Array.from({ length: 5 }, (_, im) => ({ 
        likelihood: li + 1, 
        impact: im + 1, 
        count: 0 
      }))
    );

    data.forEach(r => {
      const l = (r.likelihood || 1) - 1;
      const i = (r.impact || 1) - 1;
      if (l >= 0 && l < 5 && i >= 0 && i < 5) heatMap[l][i].count++;
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit), heat_map: heatMap };
  },

  updateRisk: async (id, data) => {
    const updates = { ...data };
    if (!updates.wbs_id) delete updates.wbs_id;
    if (!updates.owner_id) delete updates.owner_id;
    
    if (data.likelihood || data.impact) {
      const current = await prisma.riskRegister.findUnique({ where: { id } });
      const L = Number(data.likelihood || current.likelihood);
      const I = Number(data.impact || current.impact);
      updates.risk_score = L * I;
      updates.risk_level = updates.risk_score >= 15 ? 'CRITICAL' : 
                           updates.risk_score >= 10 ? 'HIGH' : 
                           updates.risk_score >= 5 ? 'MEDIUM' : 'LOW';
    }

    if (data.review_date) updates.review_date = new Date(data.review_date);
    if (data.closed_at) updates.closed_at = new Date(data.closed_at);

    return prisma.riskRegister.update({
      where: { id },
      data: updates
    });
  },

  // ─── Hindrance Logs ──────────────────────────────────────────────────────────
  createHindrance: async (data, userId, companyId) => {
    const payloadDetails = { ...data };
    if (!payloadDetails.wbs_id) delete payloadDetails.wbs_id;

    return prisma.hindranceLog.create({
      data: {
        ...payloadDetails,
        company_id: companyId,
        created_by: userId,
        hindrance_date: new Date(data.hindrance_date)
      },
      include: { wbs: { select: { id: true, name: true } } }
    });
  },

  listHindrances: async ({ project_id, wbs_id, status, category, page = 1, limit = 50 }, tenantId) => {
    const where = {
      company_id: tenantId,
      ...(project_id && { project_id }),
      ...(wbs_id && { wbs_id }),
      ...(status && { status }),
      ...(category && { category })
    };

    const [data, total] = await Promise.all([
      prisma.hindranceLog.findMany({
        where,
        orderBy: { hindrance_date: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          wbs: { select: { id: true, name: true, wbs_code: true } },
          creator: { select: { id: true, name: true } }
        }
      }),
      prisma.hindranceLog.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  updateHindrance: async (id, data) => {
    const updates = { ...data };
    if (!updates.wbs_id) delete updates.wbs_id;
    
    if (data.hindrance_date) updates.hindrance_date = new Date(data.hindrance_date);
    if (data.resolved_at) updates.resolved_at = new Date(data.resolved_at);

    return prisma.hindranceLog.update({
      where: { id },
      data: updates
    });
  }
};

module.exports = riskService;
