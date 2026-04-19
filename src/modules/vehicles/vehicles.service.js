const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

async function getAllVehicles(user, runningSite, departmentId, page = 1, pageSize = 50) {
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
        prisma.vehicle.findMany({
            where,
            skip,
            take: pageSize,
            include: {
                project: { select: { name: true, code: true } },
                departments: { select: { name: true } }
            },
            orderBy: { vehicle_no: "asc" }
        }),
        prisma.vehicle.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getVehicleById(id, user) {
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

    return await prisma.vehicle.findFirst({
        where,
        include: {
            project: { select: { name: true, code: true } },
            departments: { select: { name: true } }
        }
    });
}

async function createVehicle(data, user) {
    const { companyId, isSuperAdmin } = user;
    const targetCompanyId = isSuperAdmin ? (data.company_id || companyId) : companyId;

    // 1. Validate Required Fields
    if (!data.vehicle_no) throw new Error("Missing required fields: Vehicle number is mandatory.");

    // 2. Tenant & Relation Validation
    if (data.running_site) {
        const project = await prisma.project.findFirst({ 
            where: { ...applyDataScope(user, { projectFilter: true, projectModel: true }), id: data.running_site } 
        });
        if (!project) throw new Error("Invalid Relation: Running site project not found or access denied.");
    }

    // 3. Uniqueness Checks (Including soft-deleted)
    const existingNo = await prisma.vehicle.findUnique({ where: { vehicle_no: data.vehicle_no } });
    if (existingNo) {
        if (existingNo.deleted_at) throw new Error(`Archived Entry: Vehicle number '${data.vehicle_no}' exists in trash. Restore it or use a different number.`);
        throw new Error(`Duplicate Entry: Vehicle number '${data.vehicle_no}' already exists.`);
    }

    if (data.plate_no) {
        const existingPlate = await prisma.vehicle.findFirst({ where: { plate_no: data.plate_no } });
        if (existingPlate) {
            if (existingPlate.deleted_at) throw new Error(`Archived Entry: Plate number '${data.plate_no}' exists in trash.`);
            throw new Error(`Duplicate Entry: Plate number '${data.plate_no}' already exists on another vehicle.`);
        }
    }

    return await prisma.vehicle.create({
        data: {
            department: data.department || null,
            vehicle_no: data.vehicle_no,
            plate_no: data.plate_no || null,
            fitness_expiry_date: data.fitness_expiry_date ? new Date(data.fitness_expiry_date) : null,
            registration_expiry: data.registration_expiry ? new Date(data.registration_expiry) : null,
            insurance_expiry: data.insurance_expiry ? new Date(data.insurance_expiry) : null,
            mvpi_expiry: data.mvpi_expiry ? new Date(data.mvpi_expiry) : null,
            insurance_details: data.insurance_details || null,
            service_interval: data.service_interval ? parseInt(data.service_interval) : null,
            odometer_reading: data.odometer_reading ? parseInt(data.odometer_reading) : null,
            mileage_calculation: data.mileage_calculation ? parseFloat(data.mileage_calculation) : null,
            authorization_id: data.authorization_id || null,
            running_site: data.running_site || null,
            monthly_petrol_expense: data.monthly_petrol_expense ? parseFloat(data.monthly_petrol_expense) : null,
            company_id: targetCompanyId,
            department_id: data.department_id || null
        }
    });
}

async function updateVehicle(id, data, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id };
    if (!isSuperAdmin) where.company_id = companyId;

    // 1. Tenant Security
    const vehicle = await prisma.vehicle.findFirst({ where });
    if (!vehicle) throw new Error("Vehicle not found or access denied.");

    const targetCompanyId = isSuperAdmin ? (data.company_id || vehicle.company_id) : vehicle.company_id;

    return await prisma.vehicle.update({
        where: { id },
        data: {
            department: data.department,
            vehicle_no: data.vehicle_no,
            plate_no: data.plate_no,
            fitness_expiry_date: data.fitness_expiry_date ? new Date(data.fitness_expiry_date) : null,
            registration_expiry: data.registration_expiry ? new Date(data.registration_expiry) : null,
            insurance_expiry: data.insurance_expiry ? new Date(data.insurance_expiry) : null,
            mvpi_expiry: data.mvpi_expiry ? new Date(data.mvpi_expiry) : null,
            insurance_details: data.insurance_details,
            service_interval: data.service_interval ? parseInt(data.service_interval) : null,
            odometer_reading: data.odometer_reading ? parseInt(data.odometer_reading) : null,
            mileage_calculation: data.mileage_calculation ? parseFloat(data.mileage_calculation) : null,
            authorization_id: data.authorization_id,
            running_site: data.running_site,
            company_id: targetCompanyId,
            department_id: data.department_id,
            monthly_petrol_expense: data.monthly_petrol_expense ? parseFloat(data.monthly_petrol_expense) : null,
            updated_at: new Date()
        }
    });
}

async function deleteVehicle(id, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id };
    if (!isSuperAdmin) where.company_id = companyId;

    const vehicle = await prisma.vehicle.findFirst({ where });
    if (!vehicle) throw new Error("Vehicle not found or access denied.");

    return await prisma.vehicle.update({
        where: { id },
        data: { 
            deleted_at: new Date()
        }
    });
}

module.exports = {
    getAllVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle
};
