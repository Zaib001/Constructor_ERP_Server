const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

async function getAllEquipment(user, runningSite, departmentId, page = 1, pageSize = 50) {
    const { companyId, isSuperAdmin } = user;
    
    const skip = (page - 1) * pageSize;
    let where = applyDataScope(user, { projectFilter: true });
    
    // Add flexibility: users should see assets assigned to their projects OR unassigned assets
    if (where.project) {
        where = {
            OR: [
                { ...where },
                { running_site: null, company_id: user.companyId }
            ]
        };
    }

    if (runningSite) where.running_site = runningSite;
    if (departmentId) where.department_id = departmentId;
    
    const [data, total] = await Promise.all([
        prisma.equipment.findMany({
            where,
            skip,
            take: pageSize,
            include: {
                project: { select: { name: true, code: true } },
                departments: { select: { name: true } }
            },
            orderBy: { equipment_no: "asc" }
        }),
        prisma.equipment.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getEquipmentById(id, user) {
    let where = applyDataScope(user, { projectFilter: true });
    
    if (where.project) {
        where = {
            id,
            OR: [
                { ...where },
                { running_site: null, company_id: user.companyId }
            ]
        };
    } else {
        where.id = id;
    }

    return await prisma.equipment.findFirst({
        where,
        include: {
            project: { select: { name: true, code: true } },
            departments: { select: { name: true } }
        }
    });
}

async function createEquipment(data, user) {
    const { companyId, isSuperAdmin } = user;
    const targetCompanyId = isSuperAdmin ? (data.company_id || companyId) : companyId;

    // 1. Validate Required Fields
    if (!data.equipment_no || !data.name) {
        throw new Error("Missing required fields: Equipment number and name are mandatory.");
    }

    // 2. Tenant & Relation Validation
    if (data.running_site) {
        const project = await prisma.project.findFirst({ 
            where: { ...applyDataScope(user, { projectFilter: true, projectModel: true }), id: data.running_site } 
        });
        if (!project) throw new Error("Invalid Relation: Running site project not found or access denied.");
    }

    // 3. Uniqueness Checks (Including soft-deleted)
    const existing = await prisma.equipment.findUnique({ where: { equipment_no: data.equipment_no } });
    if (existing) {
        if (existing.deleted_at) throw new Error(`Archived Entry: Equipment number '${data.equipment_no}' exists in trash. Restore it or use a different number.`);
        throw new Error(`Duplicate Entry: Equipment number '${data.equipment_no}' already exists.`);
    }

    return await prisma.equipment.create({
        data: {
            equipment_no: data.equipment_no,
            name: data.name,
            department: data.department || null,
            preventive_maintenance_date: data.preventive_maintenance_date ? new Date(data.preventive_maintenance_date) : null,
            third_party_certification_validity: data.third_party_certification_validity ? new Date(data.third_party_certification_validity) : null,
            registration_expiry: data.registration_expiry ? new Date(data.registration_expiry) : null,
            insurance_expiry: data.insurance_expiry ? new Date(data.insurance_expiry) : null,
            running_site: data.running_site || null,
            authorization_id: data.authorization_id || null,
            last_inspection_date: data.last_inspection_date ? new Date(data.last_inspection_date) : null,
            status: data.status || "active",
            company_id: targetCompanyId,
            department_id: data.department_id || null
        }
    });
}

async function updateEquipment(id, data, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id };
    if (!isSuperAdmin) where.company_id = companyId;

    // 1. Tenant Security
    const equipment = await prisma.equipment.findFirst({ where });
    if (!equipment) throw new Error("Equipment not found or access denied.");

    const targetCompanyId = isSuperAdmin ? (data.company_id || equipment.company_id) : equipment.company_id;

    return await prisma.equipment.update({
        where: { id },
        data: {
            equipment_no: data.equipment_no,
            name: data.name,
            department: data.department,
            preventive_maintenance_date: data.preventive_maintenance_date ? new Date(data.preventive_maintenance_date) : null,
            third_party_certification_validity: data.third_party_certification_validity ? new Date(data.third_party_certification_validity) : null,
            registration_expiry: data.registration_expiry ? new Date(data.registration_expiry) : null,
            insurance_expiry: data.insurance_expiry ? new Date(data.insurance_expiry) : null,
            running_site: data.running_site,
            authorization_id: data.authorization_id,
            last_inspection_date: data.last_inspection_date ? new Date(data.last_inspection_date) : null,
            status: data.status,
            company_id: targetCompanyId,
            department_id: data.department_id,
            updated_at: new Date()
        }
    });
}

async function deleteEquipment(id, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id };
    if (!isSuperAdmin) where.company_id = companyId;

    const equipment = await prisma.equipment.findFirst({ where });
    if (!equipment) throw new Error("Equipment not found or access denied.");

    return await prisma.equipment.update({
        where: { id },
        data: { 
            deleted_at: new Date()
        }
    });
}

module.exports = {
    getAllEquipment,
    getEquipmentById,
    createEquipment,
    updateEquipment,
    deleteEquipment
};
