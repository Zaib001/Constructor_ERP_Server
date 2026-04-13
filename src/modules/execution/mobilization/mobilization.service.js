"use strict";

const prisma = require("../../../db");

/**
 * Log a mobilization or demobilization event
 */
exports.createMobilizationLog = async (data, user) => {
    return prisma.mobilizationLog.create({
        data: {
            company_id: user.company_id,
            project_id: data.project_id,
            resource_type: data.resource_type,
            resource_name: data.resource_name,
            planned_date: new Date(data.planned_date),
            status: "pending",
            remarks: data.remarks
        }
    });
};

/**
 * List mobilization logs for a project
 */
exports.listMobilizationLogs = async (projectId, companyId) => {
    const where = { company_id: companyId };
    
    if (projectId === "all") {
        // Master view: show all logs for this company
    } else if (projectId === "general" || projectId === "null" || projectId === "undefined" || !projectId) {
        where.project_id = null;
    } else {
        where.project_id = projectId;
    }

    return prisma.mobilizationLog.findMany({
        where,
        orderBy: { planned_date: "asc" }
    });
};

/**
 * Update mobilization status (mobilized / demobilized)
 */
exports.updateMobilizationStatus = async (id, data) => {
    const updateData = {
        status: data.status,
        updated_at: new Date()
    };

    if (data.status === "mobilized") {
        updateData.actual_date = new Date();
    }

    return prisma.mobilizationLog.update({
        where: { id },
        data: updateData
    });
};

/**
 * Get pending mobilizations for dashboard
 */
exports.getPendingMobilizationCount = async (companyId) => {
    const today = new Date();
    return prisma.mobilizationLog.count({
        where: {
            company_id: companyId,
            status: "pending",
            planned_date: { lte: today } // Count those that SHOULD have started by now
        }
    });
};
