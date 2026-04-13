const prisma = require('../../../db');
const logger = require('../../../logger');

/**
 * Log a site hindrance (delay, weather, breakdown)
 */
async function createHindrance(data, userId, companyId) {
    const { 
        project_id, 
        dpr_id, 
        hindrance_date, 
        category, 
        description, 
        wbs_id, 
        impact_hours, 
        responsible_party 
    } = data;

    return prisma.hindranceLog.create({
        data: {
            company_id: companyId,
            project_id,
            dpr_id,
            hindrance_date: new Date(hindrance_date),
            category, // MATERIAL | DESIGN | MANPOWER | WEATHER | CLIENT | SUBCONTRACTOR
            description,
            wbs_id,
            impact_hours: impact_hours ? Number(impact_hours) : null,
            responsible_party,
            status: "open",
            created_by: userId
        },
        include: {
            project: { select: { name: true } },
            wbs: { select: { name: true } }
        }
    });
}

/**
 * Resolve a hindrance
 */
async function resolveHindrance(id, resolutionData, userId, companyId) {
    const { notes } = resolutionData;
    
    return prisma.hindranceLog.update({
        where: { id },
        data: {
            status: "resolved",
            resolved_at: new Date(),
            resolution_notes: notes,
            updated_at: new Date()
        }
    });
}

/**
 * List hindrances for a project
 */
async function listHindrances({ project_id, status, category, page = 1, limit = 20 }, companyId) {
    const where = {
        company_id: companyId,
        ...(project_id && { project_id }),
        ...(status && { status }),
        ...(category && { category })
    };

    const [data, total] = await Promise.all([
        prisma.hindranceLog.findMany({
            where,
            orderBy: { created_at: "desc" },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
            include: {
                project: { select: { name: true } },
                wbs: { select: { name: true } },
                creator: { select: { name: true } }
            }
        }),
        prisma.hindranceLog.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

module.exports = {
    createHindrance,
    resolveHindrance,
    listHindrances
};
