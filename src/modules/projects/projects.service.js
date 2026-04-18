const prisma = require("../../db");
const { applyDataScope, MODULES } = require("../../utils/scoping");

const projectsService = {
    async getAll(user, page = 1, pageSize = 50) {
        const where = applyDataScope(user, { 
            module: MODULES.PROJECTS, 
            isWrite: false, 
            projectFilter: true, 
            projectModel: true 
        });

        // Exclude archived (deleted) projects from the default list
        where.status = { not: 'archived' };

        const skip = (page - 1) * pageSize;

        const [data, total] = await Promise.all([
            prisma.project.findMany({
                where,
                skip,
                take: pageSize,
                include: {
                    _count: {
                        select: {
                            wbs: true,
                            employees: true,
                            vehicles: true,
                            equipment: true,
                            purchase_requisitions: true
                        }
                    }
                },
                orderBy: { created_at: 'desc' }
            }),
            prisma.project.count({ where })
        ]);

        return { data, total, page, pageSize };
    },

    async getById(id, user) {
        const where = applyDataScope(user, { 
            module: MODULES.PROJECTS, 
            isWrite: false, 
            projectFilter: true, 
            projectModel: true 
        });
        where.id = id;

        return await prisma.project.findFirst({
            where,
            include: {
                company: true,
                _count: {
                    select: { wbs: true, employees: true }
                }
            }
        });
    },

    async create(data, user) {
        const { companyId, isSuperAdmin } = user;
        const targetCompanyId = isSuperAdmin ? (data.company_id || companyId) : companyId;

        // 1. Validate Required Fields & Negative Values
        if (!data.name || !data.code || !targetCompanyId) {
            throw new Error("Missing required fields: name, code, and company_id are mandatory.");
        }
        
        if (data.budget < 0 || data.revenue < 0 || data.cost < 0) {
            throw new Error("Financial Error: Budget, revenue, and cost cannot be negative.");
        }

        // 2. Prevent Duplicate Codes (Including soft-deleted ones to prevent collision)
        const existing = await prisma.project.findFirst({ 
            where: { code: data.code, company_id: data.company_id } 
        });
        if (existing) {
            if (existing.status === 'archived') throw new Error(`Archived Entry: Project code '${data.code}' exists in archive. Use a different code.`);
            throw new Error(`Duplicate Entry: Project code '${data.code}' is already assigned to '${existing.name}'.`);
        }

        return await prisma.project.create({
            data: {
                name: data.name,
                code: data.code,
                description: data.description,
                status: data.status || 'active',
                location: data.location,
                client: data.client,
                start_date: data.start_date ? new Date(data.start_date) : null,
                end_date: data.end_date ? new Date(data.end_date) : null,
                budget: data.budget || 0,
                revenue: data.revenue || 0,
                cost: data.cost || 0,
                company_id: targetCompanyId
            }
        });
    },

    async update(id, user, data) {
        const where = applyDataScope(user, { module: MODULES.PROJECTS, isWrite: true });
        where.id = id;

        // 1. Tenant Security (findFirst with where ensures isolation)
        const project = await prisma.project.findFirst({ where });
        if (!project) throw new Error("Project not found or access denied.");

        if (data.budget < 0 || data.revenue < 0 || data.cost < 0) {
            throw new Error("Financial Error: Budget, revenue, and cost cannot be negative.");
        }

        return await prisma.project.update({
            where: { id },
            data: {
                name: data.name,
                code: data.code,
                description: data.description,
                status: data.status,
                location: data.location,
                client: data.client,
                start_date: data.start_date ? new Date(data.start_date) : null,
                end_date: data.end_date ? new Date(data.end_date) : null,
                budget: data.budget,
                revenue: data.revenue,
                cost: data.cost,
                updated_at: new Date()
            }
        });
    },

    async delete(id, user) {
        const where = applyDataScope(user, { module: MODULES.PROJECTS, isWrite: true });
        where.id = id;

        const project = await prisma.project.findFirst({ where });
        if (!project) throw new Error("Project not found or access denied");

        // Archive the project (soft delete via status)
        return await prisma.project.update({
            where: { id },
            data: { status: 'archived' }
        });
    }
};

module.exports = projectsService;
