const prisma = require('../../../db');

/**
 * Clock-In a resource (Labor or Equipment)
 */
async function clockIn(data, actorId, companyId) {
    const { 
        project_id, 
        dpr_id, 
        resource_type, 
        employee_id, 
        equipment_id, 
        wbs_id, 
        remarks 
    } = data;

    // DPR context is optional at clock-in; can be linked later when the report is drafted
    return prisma.resourceLog.create({
        data: {
            company_id: companyId,
            project_id,
            dpr_id: dpr_id && dpr_id !== 'temp-demo-id' ? dpr_id : null,
            resource_type,
            employee_id: employee_id || null,
            equipment_id: equipment_id || null,
            wbs_id: wbs_id || null,
            check_in_at: new Date(),
            created_by: actorId,
            remarks
        }
    });
}

/**
 * Clock-Out a resource and calculate hours/fuel
 */
async function clockOut(logId, data, actorId, companyId) {
    const { fuel_consumed, remarks } = data;
    const log = await prisma.resourceLog.findFirst({
        where: { id: logId, company_id: companyId }
    });
    if (!log) throw new Error("Clock-In record not found");
    if (log.check_out_at) throw new Error("Resource already clocked out");

    const checkOutAt = new Date();
    const checkInAt = new Date(log.check_in_at);
    const diffMs = checkOutAt - checkInAt;
    const hours = Math.max(0, (diffMs / (1000 * 60 * 60))).toFixed(2);

    const updateData = {
        check_out_at: checkOutAt,
        remarks: remarks || log.remarks
    };

    if (log.resource_type === 'LABOR') {
        updateData.hours_worked = Number(hours);
    } else {
        updateData.hours_used = Number(hours);
        if (fuel_consumed) updateData.fuel_consumed = Number(fuel_consumed);
    }

    return prisma.resourceLog.update({
        where: { id: logId },
        data: updateData
    });
}

/**
 * Bulk Clock-In for a whole crew
 */
async function bulkClockIn(data, actorId, companyId) {
    const { 
        project_id, 
        dpr_id, 
        employee_ids = [], 
        wbs_id, 
        remarks 
    } = data;

    // DPR context is optional during bulk checking
    const operations = employee_ids.map(empId => (
        prisma.resourceLog.create({
            data: {
                company_id: companyId,
                project_id,
                dpr_id: dpr_id && dpr_id !== 'temp-demo-id' ? dpr_id : null,
                resource_type: 'LABOR',
                employee_id: empId,
                wbs_id: wbs_id || null,
                check_in_at: new Date(),
                created_by: actorId,
                remarks: remarks || "Crew bulk clock-in"
            }
        })
    ));

    return prisma.$transaction(operations);
}

/**
 * List active resources (clocked in but not clocked out)
 */
async function listActiveResources({ project_id, status }, companyId) {
    const where = {
        company_id: companyId,
        ...(project_id && { project_id })
    };

    if (status === 'active') {
        where.check_out_at = null; // Only currently clocked-in personnel
    }

    const data = await prisma.resourceLog.findMany({
        where,
        orderBy: { check_in_at: 'desc' },
        include: {
            employee: { select: { name: true, designation: true } },
            equipment: { select: { name: true, equipment_no: true } },
            wbs: { select: { name: true, wbs_code: true } }
        }
    });

    return { data };
}

/**
 * Get dynamic summary of site presence
 */
async function getDailyPresenceSummary(projectId, companyId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await prisma.resourceLog.findMany({
        where: {
            project_id: projectId,
            company_id: companyId,
            check_in_at: { gte: today }
        }
    });

    const summary = {
        total_labor: logs.filter(l => l.resource_type === 'LABOR').length,
        total_equipment: logs.filter(l => l.resource_type === 'EQUIPMENT').length,
        active_now: logs.filter(l => !l.check_out_at).length,
        total_man_hours: logs.reduce((acc, l) => acc + Number(l.hours_worked || 0), 0),
        total_fuel: logs.reduce((acc, l) => acc + Number(l.fuel_consumed || 0), 0)
    };

    return summary;
}

module.exports = {
    clockIn,
    clockOut,
    bulkClockIn,
    listActiveResources,
    getDailyPresenceSummary
};
