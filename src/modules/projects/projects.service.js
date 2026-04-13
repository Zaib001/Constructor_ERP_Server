const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

const projectsService = {
    async getAll(user, page = 1, pageSize = 50) {
        const where = applyDataScope(user, { projectFilter: true, projectModel: true });

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
        const where = applyDataScope(user, { projectFilter: true, projectModel: true });
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
            if (existing.deleted_at) throw new Error(`Archived Entry: Project code '${data.code}' exists in trash. Restore it or use a different code.`);
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
        const { companyId, isSuperAdmin } = user;
        const where = { id, deleted_at: null };
        if (!isSuperAdmin) where.company_id = companyId;

        // 1. Tenant Security
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
        const { companyId, isSuperAdmin } = user;
        const where = { id, deleted_at: null };
        if (!isSuperAdmin) where.company_id = companyId;

        // 1. Verify Ownership & Existence
        const project = await prisma.project.findFirst({
            where,
            include: { _count: { select: { wbs: true, employees: true } } }
        });

        if (!project) throw new Error("Project not found or access denied");

        // 2. Restrict deletion if active sub-entities exist (Safety check)
        if (project._count.employees > 0) {
            throw new Error(`Constraint Error: Cannot delete project with ${project._count.employees} assigned employees. Reassign them first.`);
        }

        // 3. Perform Soft Delete within a transaction
        return await prisma.$transaction(async (tx) => {
            // Soft delete the project
            const deleted = await tx.project.update({
                where: { id },
                data: { 
                    deleted_at: new Date(),
                    status: 'archived'
                }
            });

            // Soft delete associated WBS and Cost Codes
            await tx.wbs.updateMany({
                where: { project_id: id },
                data: { deleted_at: new Date() }
            });

            return deleted;
        });
    }
};

module.exports = projectsService;
