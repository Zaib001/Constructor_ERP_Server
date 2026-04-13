const prisma = require('../../../db');

/**
 * Assign a work task from PE/PM to a Site Engineer
 */
async function assignTask(data, actorId, companyId) {
    const { 
        project_id, 
        wbs_id, 
        description, 
        target_qty, 
        uom, 
        priority, 
        assigned_to_id, 
        due_date 
    } = data;

    return prisma.executionTask.create({
        data: {
            company_id: companyId,
            project_id,
            wbs_id,
            description,
            target_qty: target_qty ? Number(target_qty) : null,
            uom,
            priority: priority || "medium",
            status: "assigned",
            assigned_to_id,
            assigned_by_id: actorId,
            due_date: due_date ? new Date(due_date) : null
        },
        include: {
            wbs: { select: { name: true, wbs_code: true } },
            assigned_to: { select: { name: true, designation: true } },
            assigned_by: { select: { name: true } }
        }
    });
}

/**
 * Site Engineer acknowledges a task
 */
async function updateTaskStatus(taskId, status, actorId, companyId) {
    const task = await prisma.executionTask.findFirst({
        where: { id: taskId, company_id: companyId }
    });
    if (!task) throw new Error("Task not found");

    // Strictly ensure only the assigned engineer can acknowledge or start their own mission
    // (Project Managers are already allowed via execution.manage route middleware)
    if (["acknowledged", "in_progress"].includes(status)) {
        if (task.assigned_to_id !== actorId) {
             throw new Error("You are not the assigned engineer for this mission.");
        }
    }

    const allowedStatuses = ["acknowledged", "in_progress", "completed", "verified"];
    if (!allowedStatuses.includes(status)) throw new Error("Invalid status transition");

    // "verified" status can only be set if task is currently "completed"
    if (status === "verified" && task.status !== "completed") {
        throw new Error("Task must be marked as 'completed' before it can be verified.");
    }

    const updateData = { status };
    if (status === "in_progress" && !task.started_at) {
        updateData.started_at = new Date();
    }
    if (status === "completed") {
        updateData.completed_at = new Date();
    }
    if (status === "verified") {
        // verified_at does not exist in schema — updated_at is auto-stamped by Prisma on update
        // No extra field needed here
    }

    return prisma.executionTask.update({
        where: { id: taskId },
        data: updateData
    });
}

/**
 * List tasks for a project or specific user
 */
async function listTasks({ project_id, assigned_to_id, status, page = 1, limit = 20 }, companyId) {
    const where = {
        company_id: companyId,
        ...(project_id && { project_id }),
        ...(assigned_to_id && { assigned_to_id }),
        ...(status && { status })
    };

    const [data, total] = await Promise.all([
        prisma.executionTask.findMany({
            where,
            orderBy: { created_at: "desc" },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
            include: {
                project: { select: { name: true } },
                wbs: { select: { name: true, wbs_code: true } },
                assigned_to: { select: { name: true } },
                assigned_by: { select: { name: true } }
            }
        }),
        prisma.executionTask.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Fetch missions verified on a specific date for a project
 */
async function getVerifiedMissions({ project_id, date }, companyId) {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    return prisma.executionTask.findMany({
        where: {
            project_id,
            company_id: companyId,
            status: "verified",
            updated_at: {
                gte: startOfDay,
                lte: endOfDay
            }
        },
        include: {
            wbs: { select: { id: true, name: true, wbs_code: true, unit: true } }
        }
    });
}

module.exports = {
    assignTask,
    updateTaskStatus,
    listTasks,
    getVerifiedMissions
};

