"use strict";

const prisma = require("../../../db");

/**
 * Log a delivery tracking entry for a PO item
 */
exports.createTrackingEntry = async (data, user) => {
    return prisma.deliveryTracking.create({
        data: {
            company_id: user.company_id,
            project_id: data.project_id,
            po_id: data.po_id,
            item_id: data.item_id,
            expected_date: new Date(data.expected_date),
            status: "pending",
            remarks: data.remarks
        }
    });
};

/**
 * List all delivery tracking entries for a project
 */
exports.listDeliveries = async (projectId, companyId) => {
    const where = { company_id: companyId };
    
    if (projectId === "all") {
        // Skip project filter to show everything for the company
    } else if (projectId === "general" || projectId === "null" || projectId === "undefined" || !projectId) {
        where.project_id = null;
    } else {
        where.project_id = projectId;
    }

    return prisma.deliveryTracking.findMany({
        where,
        include: {
            po: { 
                select: { 
                    po_number: true,
                    department: { select: { name: true } }
                } 
            },
            item: { select: { name: true } }
        },
        orderBy: { expected_date: "asc" }
    });
};

/**
 * Update delivery status
 */
exports.updateStatus = async (id, data) => {
    const updateData = {
        status: data.status,
        updated_at: new Date()
    };
    
    if (data.status === "delivered") {
        updateData.actual_date = new Date();
    }

    return prisma.deliveryTracking.update({
        where: { id },
        data: updateData
    });
};

/**
 * Get overdue deliveries for dashboard
 */
exports.getOverdueDeliveriesCount = async (companyId) => {
    const today = new Date();
    return prisma.deliveryTracking.count({
        where: {
            company_id: companyId,
            status: { in: ["pending", "transit", "delayed"] },
            expected_date: { lt: today }
        }
    });
};
