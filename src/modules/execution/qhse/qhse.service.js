const prisma = require('../../../db');
const { Prisma } = require('@prisma/client');

// ─── BOQ CRUD ─────────────────────────────────────────────────────────────────
async function createBOQItem(data, userId, companyId) {
  const { project_id, wbs_id, item_code, description, unit, planned_qty, unit_rate } = data;
  const total_amount = Number(planned_qty) * Number(unit_rate);
  return prisma.bOQItem.create({
    data: { company_id: companyId, project_id, wbs_id, item_code, description, unit, planned_qty: Number(planned_qty), unit_rate: Number(unit_rate), total_amount, created_by: userId },
    include: { wbs: { select: { id: true, name: true, wbs_code: true } } }
  });
}

async function listBOQItems(project_id, companyId) {
  return prisma.bOQItem.findMany({
    where: { project_id, company_id: companyId },
    include: { wbs: { select: { id: true, name: true, wbs_code: true } } },
    orderBy: { wbs: { wbs_code: 'asc' } }
  });
}

async function updateBOQItem(id, data, companyId) {
  const { planned_qty, unit_rate, ...rest } = data;
  const total_amount = planned_qty && unit_rate ? Number(planned_qty) * Number(unit_rate) : undefined;
  return prisma.bOQItem.update({
    where: { id },
    data: { ...rest, ...(planned_qty && { planned_qty: Number(planned_qty) }), ...(unit_rate && { unit_rate: Number(unit_rate) }), ...(total_amount !== undefined && { total_amount }) }
  });
}

async function deleteBOQItem(id, companyId) {
  return prisma.bOQItem.delete({ where: { id } });
}

// ─── Inspection (ITP) ─────────────────────────────────────────────────────────
async function createInspection(data, userId, companyId) {
  const count = await prisma.inspection.count({ where: { company_id: companyId } });
  const insp_no = `INSP-${companyId.slice(0, 4).toUpperCase()}-${String(count + 1).padStart(5, '0')}`;
  return prisma.inspection.create({
    data: { ...data, company_id: companyId, insp_no, created_by: userId, scheduled_date: new Date(data.scheduled_date) },
    include: { wbs: { select: { id: true, name: true } } }
  });
}

async function listInspections({ project_id, status, inspection_type, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(status && { status }), ...(inspection_type && { inspection_type }) };
  const [data, total] = await Promise.all([
    prisma.inspection.findMany({ where, orderBy: { scheduled_date: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit), include: { wbs: { select: { id: true, name: true, wbs_code: true } }, _count: { select: { ncrs: true } } } }),
    prisma.inspection.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateInspection(id, data, companyId) {
  return prisma.inspection.update({ where: { id }, data: { ...data, ...(data.scheduled_date && { scheduled_date: new Date(data.scheduled_date) }), ...(data.actual_date && { actual_date: new Date(data.actual_date) }) } });
}

// ─── NCR ─────────────────────────────────────────────────────────────────────
async function createNCR(data, userId, companyId) {
  const count = await prisma.nCR.count({ where: { company_id: companyId } });
  const ncr_no = `NCR-${String(count + 1).padStart(5, '0')}`;
  return prisma.nCR.create({
    data: { ...data, company_id: companyId, ncr_no, raised_by: userId, created_by: userId, raised_date: data.raised_date ? new Date(data.raised_date) : new Date() },
    include: { wbs: { select: { id: true, name: true } } }
  });
}

async function listNCRs({ project_id, status, severity, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(status && { status }), ...(severity && { severity }) };
  const [data, total] = await Promise.all([
    prisma.nCR.findMany({ where, orderBy: { created_at: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit), include: { raiser: { select: { id: true, name: true } }, wbs: { select: { id: true, name: true } } } }),
    prisma.nCR.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateNCR(id, data, companyId) {
  return prisma.nCR.update({ where: { id }, data: { ...data, ...(data.target_close && { target_close: new Date(data.target_close) }), ...(data.actual_close && { actual_close: new Date(data.actual_close) }) } });
}

// ─── Safety Incident ──────────────────────────────────────────────────────────
async function createIncident(data, userId, companyId) {
  const count = await prisma.safetyIncident.count({ where: { company_id: companyId } });
  const incident_no = `INC-${String(count + 1).padStart(5, '0')}`;
  return prisma.safetyIncident.create({
    data: { ...data, company_id: companyId, incident_no, created_by: userId, incident_date: new Date(data.incident_date) }
  });
}

async function listIncidents({ project_id, category, status, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }), ...(category && { category }), ...(status && { status }) };
  const [data, total] = await Promise.all([
    prisma.safetyIncident.findMany({ where, orderBy: { incident_date: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit), include: { creator: { select: { id: true, name: true } } } }),
    prisma.safetyIncident.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateIncident(id, data) {
  return prisma.safetyIncident.update({ where: { id }, data: { ...data, ...(data.closed_at && { closed_at: new Date(data.closed_at) }) } });
}

// ─── HSE Induction ───────────────────────────────────────────────────────────
async function createInduction(data, userId, companyId) {
  return prisma.hSEInduction.create({
    data: { ...data, company_id: companyId, created_by: userId, induction_date: new Date(data.induction_date), ...(data.valid_until && { valid_until: new Date(data.valid_until) }) }
  });
}

async function listInductions({ project_id, page = 1, limit = 20 }, companyId) {
  const where = { company_id: companyId, ...(project_id && { project_id }) };
  const [data, total] = await Promise.all([
    prisma.hSEInduction.findMany({ where, orderBy: { induction_date: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) }),
    prisma.hSEInduction.count({ where })
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── HSE Summary ─────────────────────────────────────────────────────────────
async function getHSESummary(project_id, companyId) {
  const [incidents, inductions, ncrs] = await Promise.all([
    prisma.safetyIncident.groupBy({ by: ['category', 'status'], where: { project_id, company_id: companyId }, _count: true }),
    prisma.hSEInduction.count({ where: { project_id, company_id: companyId } }),
    prisma.nCR.groupBy({ by: ['severity', 'status'], where: { project_id, company_id: companyId }, _count: true })
  ]);

  const lti = incidents.filter(i => i.category === 'LTI')._count || 0;
  const fatalities = incidents.filter(i => i.category === 'FATALITY').reduce((s, i) => s + i._count, 0);
  const nearMiss = incidents.filter(i => i.category === 'NEAR_MISS').reduce((s, i) => s + i._count, 0);
  const totalIncidents = incidents.reduce((s, i) => s + i._count, 0);

  return {
    total_incidents: totalIncidents,
    near_miss: nearMiss,
    fatalities,
    total_inducted: inductions,
    ncr_summary: ncrs,
    incidents_by_category: incidents,
  };
}

module.exports = { createBOQItem, listBOQItems, updateBOQItem, deleteBOQItem, createInspection, listInspections, updateInspection, createNCR, listNCRs, updateNCR, createIncident, listIncidents, updateIncident, createInduction, listInductions, getHSESummary };
