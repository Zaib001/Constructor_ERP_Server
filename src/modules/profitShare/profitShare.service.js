const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

async function getAllRules(user, filters = {}) {
    const where = applyDataScope(user, { includeDeleted: true });
    if (filters.entityType) where.entity_type = filters.entityType;
    
    return await prisma.profitShareRule.findMany({
        where,
        include: {
            company: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } }
        },
        orderBy: { created_at: "desc" }
    });
}

async function getRuleById(id, user) {
    const where = applyDataScope(user, { includeDeleted: true });
    where.id = id;

    return await prisma.profitShareRule.findFirst({
        where,
        include: {
            company: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } }
        }
    });
}

async function createRule(data, user) {
    const { companyId, isSuperAdmin } = user;
    const targetCompanyId = isSuperAdmin ? (data.company_id || companyId) : companyId;

    if (!targetCompanyId) throw new Error("Tenant context missing");

    return await prisma.profitShareRule.create({
        data: {
            name: data.name,
            entity_type: data.entityType || data.entity_type,
            entity_id: data.entityId || data.entity_id || null,
            company_id: targetCompanyId,
            department_id: data.departmentId || data.department_id || null,
            project_id: data.projectId || data.project_id || null,
            partner_a_name: data.partnerAName || data.partner_a_name,
            partner_a_share: data.partnerAShare || data.partner_a_share,
            partner_b_name: data.partnerBName || data.partner_b_name,
            partner_b_share: data.partnerBShare || data.partner_b_share,
            is_active: true
        }
    });
}

async function updateRule(id, data, user) {
    const where = applyDataScope(user, { includeDeleted: true });
    where.id = id;

    const existing = await prisma.profitShareRule.findFirst({ where });
    if (!existing) throw new Error("Rule not found or access denied.");

    return await prisma.profitShareRule.update({
        where: { id },
        data: {
            name: data.name,
            partner_a_name: data.partnerAName || data.partner_a_name,
            partner_a_share: data.partnerAShare || data.partner_a_share,
            partner_b_name: data.partnerBName || data.partner_b_name,
            partner_b_share: data.partnerBShare || data.partner_b_share,
            is_active: data.is_active,
            updated_at: new Date()
        }
    });
}

async function deleteRule(id, user) {
    const where = applyDataScope(user, { includeDeleted: true });
    where.id = id;

    const existing = await prisma.profitShareRule.findFirst({ where });
    if (!existing) throw new Error("Rule not found or access denied.");

    return await prisma.profitShareRule.update({
        where: { id },
        data: { is_active: false, updated_at: new Date() }
    });
}

/**
 * Calculate profit share for a project or entity.
 */
async function calculateProfitShare(entityType, entityId, user) {
    const where = applyDataScope(user, { includeDeleted: true });
    where.entity_type = entityType;
    where.entity_id = entityId;
    where.is_active = true;

    const rule = await prisma.profitShareRule.findFirst({ where });
    if (!rule) return null;

    let totalProfit = 0;
    if (entityType === "PROJECT") {
        const project = await prisma.project.findFirst({ 
            where: { ...applyDataScope(user), id: entityId } 
        });
        if (project) {
            totalProfit = Number(project.revenue || 0) - Number(project.cost || 0);
        }
    }

    const shareA = totalProfit * (Number(rule.partner_a_share || 0) / 100);
    const shareB = totalProfit * (Number(rule.partner_b_share || 0) / 100);

    return {
        rule,
        totalProfit,
        partnerA: { name: rule.partner_a_name, share: rule.partner_a_share, amount: shareA },
        partnerB: { name: rule.partner_b_name, share: rule.partner_b_share, amount: shareB }
    };
}

module.exports = { getAllRules, getRuleById, createRule, updateRule, deleteRule, calculateProfitShare };
