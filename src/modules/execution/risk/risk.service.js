const prisma = require('../../../db');
const { Prisma } = require('@prisma/client');

// ─── Risk Register ────────────────────────────────────────────────────────────
async function createRisk(data, userId, companyId) {
  const count = await prisma.riskRegister.count({ where: { company_id: companyId } });
  const risk_id_no = `R-${String(count + 1).padStart(4, '0')}`;
  const likelihood = Number(data.likelihood);
  const impact     = Number(data.impact);
  const risk_score = likelihood * impact;
  const risk_level = risk_score >= 20 ? 'CRITICAL' : risk_score >= 12 ? 'HIGH' : risk_score >= 6 ? 'MEDIUM' : 'LOW';

  return prisma.riskRegister.create({
    data: { ...data, company_id: companyId, risk_id_no, likelihood, impact, risk_score, risk_level, created_by: userId, ...(data.review_date && { review_date: new Date(data.review_date) }) },
    include: { creator: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } }
  });
}

async function listRisks({ project_id, status, risk_level, category, page = 1, limit = 50 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(status && { status }), ...(risk_level && { risk_level }), ...(category && { category }) };
  const [data, total] = await Promise.all([
    prisma.riskRegister.findMany({ where, orderBy: [{ risk_score: 'desc' }, { created_at: 'desc' }], skip: (Number(page) - 1) * Number(limit), take: Number(limit), include: { creator: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } } }),
    prisma.riskRegister.count({ where })
  ]);

  // Heat map matrix: 5x5 grid, each cell = count of risks at that likelihood/impact
  const heatMap = Array.from({ length: 5 }, (_, li) =>
    Array.from({ length: 5 }, (_, im) => ({ likelihood: li + 1, impact: im + 1, count: 0, risks: [] }))
  );
  data.forEach(r => {
    const li = (r.likelihood || 1) - 1;
    const im = (r.impact || 1) - 1;
    if (li >= 0 && li < 5 && im >= 0 && im < 5) {
      heatMap[li][im].count++;
      heatMap[li][im].risks.push({ id: r.id, title: r.title, risk_level: r.risk_level });
    }
  });

  return { data, total, page, limit, totalPages: Math.ceil(total / limit), heat_map: heatMap };
}

async function updateRisk(id, data, companyId) {
  const updates = { ...data };
  if (data.likelihood || data.impact) {
    const risk = await prisma.riskRegister.findUnique({ where: { id } });
    const likelihood = Number(data.likelihood || risk.likelihood);
    const impact     = Number(data.impact     || risk.impact);
    updates.likelihood = likelihood;
    updates.impact     = impact;
    updates.risk_score = likelihood * impact;
    updates.risk_level = updates.risk_score >= 20 ? 'CRITICAL' : updates.risk_score >= 12 ? 'HIGH' : updates.risk_score >= 6 ? 'MEDIUM' : 'LOW';
  }
  return prisma.riskRegister.update({ where: { id }, data: { ...updates, ...(data.review_date && { review_date: new Date(data.review_date) }), ...(data.closed_at && { closed_at: new Date(data.closed_at) }) } });
}

// ─── Hindrance Log ────────────────────────────────────────────────────────────
async function createHindrance(data, userId, companyId) {
  return prisma.hindranceLog.create({
    data: { ...data, company_id: companyId, created_by: userId, hindrance_date: new Date(data.hindrance_date) },
    include: { wbs: { select: { id: true, name: true } } }
  });
}

async function listHindrances({ project_id, status, category, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(status && { status }), ...(category && { category }) };
  const [data, total] = await Promise.all([
    prisma.hindranceLog.findMany({ where, orderBy: { hindrance_date: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit), include: { wbs: { select: { id: true, name: true } }, creator: { select: { id: true, name: true } } } }),
    prisma.hindranceLog.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateHindrance(id, data) {
  return prisma.hindranceLog.update({ where: { id }, data: { ...data, ...(data.resolved_at && { resolved_at: new Date(data.resolved_at) }) } });
}

module.exports = { createRisk, listRisks, updateRisk, createHindrance, listHindrances, updateHindrance };
