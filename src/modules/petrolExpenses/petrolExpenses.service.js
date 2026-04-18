const prisma = require("../../db");
const { applyDataScope, MODULES } = require("../../utils/scoping");

async function getAllExpenses(user, page, pageSize) {
    const { isSuperAdmin, roleCode, id: userId } = user;
    const where = applyDataScope(user, { module: MODULES.FLEET, isWrite: false });

    // Project Scoping: PM, Site Engineer, and Site Coordinator see only assigned projects for 'job' type
    if (!isSuperAdmin && roleCode !== "erp_admin" && ["project_manager", "site_engineer", "site_coordinator"].includes(roleCode)) {
        where.OR = [
            { job_type: "admin" },
            {
                job_type: "job",
                project: {
                    user_projects: {
                        some: {
                            user_id: userId,
                            revoked_at: null
                        }
                    }
                }
            }
        ];
    }

    const skip = (page - 1) * pageSize;
    return await prisma.petrolExpense.findMany({
        where,
        skip: isNaN(skip) ? 0 : skip,
        take: isNaN(pageSize) ? 50 : pageSize,
        include: {
            vehicle: { select: { plate_no: true } }, 
            project: { select: { name: true, code: true } },
            creator: { select: { name: true } },
            verifier: { select: { name: true } }
        },
        orderBy: { fuel_date: 'desc' }
    });
}

async function getExpenseById(id, user) {
    const { isSuperAdmin, roleCode, id: userId } = user;
    const where = applyDataScope(user, { module: MODULES.FLEET, isWrite: false });
    where.id = id;

    if (!isSuperAdmin && roleCode !== "erp_admin" && ["project_manager", "site_engineer", "site_coordinator"].includes(roleCode)) {
        where.OR = [
            { job_type: "admin" },
            {
                job_type: "job",
                project: {
                    user_projects: {
                        some: {
                            user_id: userId,
                            revoked_at: null
                        }
                    }
                }
            }
        ];
    }

    return await prisma.petrolExpense.findFirst({
        where,
        include: { 
            vehicle: { select: { plate_no: true } }, 
            project: { select: { name: true, code: true } }, 
            creator: { select: { name: true } }, 
            verifier: { select: { name: true } } 
        }
    });
}

async function createExpense(data, user) {
    const actor = await prisma.user.findUnique({ where: { id: user.id }, include: { roles: true }});
    const roleCode = actor.roles?.code || "unknown";
    const allowed = ["site_engineer", "project_manager", "erp_admin", "super_admin", "fleet_coordinator"];
    if (!allowed.includes(roleCode)) {
        throw new Error("Unauthorized: Role not allowed to record petrol expenses.");
    }
    const companyId = user.isSuperAdmin ? data.company_id : user.companyId;

    // Job Flow Validation
    if (data.job_type === "job") {
        if (!data.project_id) throw new Error("jobType 'job' requires a projectId");
        
        // 1. Tenant & Project Scoping
        const scopedProjectWhere = applyDataScope(user, { 
            module: MODULES.PROJECTS, 
            isWrite: false, 
            projectFilter: true, 
            projectModel: true 
        });
        const project = await prisma.project.findFirst({
            where: { ...scopedProjectWhere, id: data.project_id }
        });
        if (!project) {
            throw new Error("Reference project not found or access denied.");
        }
    } else if (data.job_type === "admin") {
        data.project_id = null;
    } else {
        throw new Error("Invalid job_type. Must be 'job' or 'admin'");
    }

    // Checking VAT Math
    const exclVat = Number(data.petrol_amount_excl_vat || 0);
    const vat = Number(data.vat_amount || 0);
    const total = Number(data.total_amount || 0);

    if (Math.abs((exclVat + vat) - total) > 0.01) {
        throw new Error("VAT validation failed: totalAmount must equal petrolAmountExcludingVat + vatAmount");
    }

    const newOdometer = parseInt(data.odometer_reading, 10);
    if (isNaN(newOdometer)) throw new Error("Valid odometer reading is required");

    // Concurrency safe logic: Transaction with Read/Update Lock
    return await prisma.$transaction(async (tx) => {
        // Fetch vehicle safely, locking the row for update so no concurrent requests can interfere.
        // We use queryRaw because Prisma doesn't natively expose SELECT ... FOR UPDATE efficiently.
        const vehicles = await tx.$queryRaw`SELECT id, odometer_reading, plate_no, company_id FROM auth.vehicles WHERE id = ${data.vehicle_id}::uuid FOR UPDATE`;
        if (!vehicles || vehicles.length === 0) throw new Error("Vehicle not found");
        
        const vehicle = vehicles[0];
        
        // Robust UUID Comparison (String normalization)
        const vCompanyId = String(vehicle.company_id || "").toLowerCase();
        const aCompanyId = String(companyId || "").toLowerCase();

        if (vCompanyId !== aCompanyId && !user.isSuperAdmin) {
             throw new Error("Vehicle does not belong to your company");
        }

        // For Superadmins, if no company context was provided in the request, adopt the vehicle's company
        const finalizedCompanyId = (user.isSuperAdmin && !companyId) ? vehicle.company_id : companyId;
        
        const lastOdometer = vehicle.odometer_reading || 0;

        if (newOdometer <= lastOdometer) {
            throw new Error(`Odometer error: The new reading (${newOdometer}) must be strictly greater than the last recorded reading (${lastOdometer}) for this vehicle.`);
        }

        const distance = newOdometer - lastOdometer;
        const costPerKm = total / distance;

        // Save expense
        const expense = await tx.petrolExpense.create({
            data: {
                company_id: finalizedCompanyId,
                bill_no: data.bill_no,
                job_type: data.job_type,
                project_id: data.project_id,
                job_number: data.job_number,
                vehicle_id: data.vehicle_id,
                vehicle_plate_no: vehicle.plate_no,
                petrol_amount_excl_vat: exclVat,
                vat_amount: vat,
                total_amount: total,
                odometer_reading: newOdometer,
                last_odometer: lastOdometer,
                distance_since_last: distance,
                cost_per_km: costPerKm,
                fuel_date: new Date(data.fuel_date),
                created_by: user.id,
                verification_status: "pending",
                remarks: data.remarks,
                attachment: data.attachment ? (typeof data.attachment === 'string' ? data.attachment : JSON.stringify(data.attachment)) : null
            }
        });

        // Atomic update of vehicle odometer
        await tx.vehicle.update({
            where: { id: vehicle.id },
            data: { odometer_reading: newOdometer }
        });

        return expense;
    });
}

async function updateExpense(id, data, user) {
    const where = applyDataScope(user, { module: MODULES.FLEET, isWrite: true });
    where.id = id;

    const expense = await prisma.petrolExpense.findUnique({ where });
    if (!expense) throw new Error("Petrol Expense not found");
    
    if (!["pending", "sent_back"].includes(expense.verification_status)) {
        throw new Error(`Cannot edit a petrol expense while in status: ${expense.verification_status}`);
    }

    // Prevent bypassing odometer checks when updating
    if (data.odometer_reading && data.odometer_reading !== expense.odometer_reading) {
        throw new Error("Cannot alter odometer readings on existing entries directly for data integrity. Soft-delete and recreate if necessary or reverse the vehicle reading manually via Admin tools.");
    }

    return await prisma.petrolExpense.update({
        where: { id },
        data: {
            remarks: data.remarks,
            attachment: data.attachment ? (typeof data.attachment === 'string' ? data.attachment : JSON.stringify(data.attachment)) : null
        }
    });
}

async function verifyExpense(id, user) {
    const actor = await prisma.user.findUnique({ where: { id: user.id }, include: { roles: true }});
    const roleCode = actor.roles?.code || "unknown";
    const allowed = ["accounts_officer", "erp_admin", "super_admin"];
    if (!allowed.includes(roleCode)) {
        throw new Error("Unauthorized: Role not allowed to verify petrol expenses.");
    }

    const expense = await prisma.petrolExpense.findUnique({ 
        where: { id, ...applyDataScope(user, { module: MODULES.FLEET, isWrite: true }) } 
    });
    if (!expense) throw new Error("Petrol expense not found");
    if (expense.verification_status === "verified") throw new Error("Already verified");

    if (expense.created_by === user.id && !["erp_admin", "super_admin"].includes(roleCode)) {
        throw new Error("Self-verification is not allowed. Please have another accounts officer verify this entry.");
    }

    return await prisma.petrolExpense.update({
        where: { id },
        data: {
            verification_status: "verified",
            verified_by_accounts: user.id,
            updated_at: new Date()
        }
    });
}

async function rejectExpense(id, reason, user) {
    if (!reason || reason.trim() === '') {
        throw new Error("Rejection reason is required.");
    }

    const actor = await prisma.user.findUnique({ where: { id: user.id }, include: { roles: true }});
    const roleCode = actor.roles?.code || "unknown";
    const allowed = ["accounts_officer", "erp_admin", "super_admin"];
    if (!allowed.includes(roleCode)) {
        throw new Error("Unauthorized: Role not allowed to reject petrol expenses.");
    }

    const where = applyDataScope(user, { module: MODULES.FLEET, isWrite: true });
    where.id = id;

    const expense = await prisma.petrolExpense.findFirst({ 
        where 
    });
    if (!expense) throw new Error("Petrol expense not found");
    if (expense.verification_status === "verified") throw new Error("Cannot reject an already verified record");

    if (expense.created_by === user.id && !["erp_admin", "super_admin"].includes(roleCode)) {
        throw new Error("Self-rejection is not allowed (Financial Invariant Error).");
    }

    return await prisma.petrolExpense.update({
        where: { id },
        data: {
            verification_status: "rejected",
            verified_by_accounts: user.id,
            remarks: reason, // or append to existing remarks
            updated_at: new Date()
        }
    });
}

async function getReports(filters, user) {
    const { isSuperAdmin, roleCode, id: userId } = user;
    const where = applyDataScope(user, { module: MODULES.FLEET, isWrite: false });
    where.verification_status = "verified";

    if (!isSuperAdmin && roleCode !== "erp_admin" && ["project_manager", "site_engineer", "site_coordinator"].includes(roleCode)) {
        where.OR = [
            { job_type: "admin" },
            {
                job_type: "job",
                project: {
                    user_projects: {
                        some: {
                            user_id: userId,
                            revoked_at: null
                        }
                    }
                }
            }
        ];
    }

    if (filters.vehicle_id) where.vehicle_id = filters.vehicle_id;
    if (filters.project_id) where.project_id = filters.project_id;
    if (filters.job_type) where.job_type = filters.job_type;

    if (filters.startDate && filters.endDate) {
        where.fuel_date = {
            gte: new Date(filters.startDate),
            lte: new Date(filters.endDate)
        };
    }

    const expenses = await prisma.petrolExpense.findMany({ 
        where,
        include: { project: true, vehicle: true }
    });

    let totalFuelCost = 0;
    let totalDistance = 0;
    
    // Aggregations
    const byProject = {};
    const byVehicle = {};

    expenses.forEach(x => {
        totalFuelCost += Number(x.total_amount);
        totalDistance += Number(x.distance_since_last || 0);

        if (x.project_id) {
            if (!byProject[x.project_id]) byProject[x.project_id] = 0;
            byProject[x.project_id] += Number(x.total_amount);
        }

        if (!byVehicle[x.vehicle_id]) byVehicle[x.vehicle_id] = { cost: 0, distance: 0 };
        byVehicle[x.vehicle_id].cost += Number(x.total_amount);
        byVehicle[x.vehicle_id].distance += Number(x.distance_since_last || 0);
    });

    return {
        overall: {
            totalFuelCost,
            totalDistance,
            avgCostPerKm: totalDistance > 0 ? (totalFuelCost / totalDistance).toFixed(6) : 0
        },
        byProject,
        byVehicle,
        count: expenses.length
    };
}

module.exports = { getAllExpenses, getExpenseById, createExpense, updateExpense, verifyExpense, rejectExpense, getReports };
