const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

/**
 * Aggregates all blockers for project closure.
 */
async function checkReadiness(projectId, user) {
    const where = applyDataScope(user, { projectFilter: true, projectModel: true });
    
    // 1. Fetch Project with necessary relations
    const project = await prisma.project.findFirst({
        where: { ...where, id: projectId },
        include: {
            wbs: { where: { } },
            execution_tasks: { where: { status: { notIn: ['completed', 'verified'] } } },
            ncrs: { where: { status: { not: 'closed' } } },
            punch_list_items: { where: { status: { not: 'verified' } } },
            inspections: { 
                where: { 
                    inspection_type: { contains: 'FINAL', mode: 'insensitive' },
                    result: 'PASS'
                } 
            }
        }
    });

    if (!project) throw new Error("Project not found or access denied.");

    // 2. Logic for WBS Completion
    // We check if all leaf nodes are 100%. 
    // For simplicity here, we'll check if any WBS has progress < 100.
    const incompleteWBS = project.wbs.filter(node => Number(node.progress_pct || 0) < 100);

    const readiness = {
        is_ready: false,
        blockers: [],
        stats: {
            incomplete_wbs_count: incompleteWBS.length,
            open_tasks_count: project.execution_tasks.length,
            open_ncrs_count: project.ncrs.length,
            open_snags_count: project.punch_list_items.length,
            has_final_inspection: project.inspections.length > 0
        }
    };

    if (incompleteWBS.length > 0) {
        readiness.blockers.push(`${incompleteWBS.length} WBS nodes are incomplete (<100%).`);
    }
    if (project.execution_tasks.length > 0) {
        readiness.blockers.push(`${project.execution_tasks.length} critical work tasks are not verified.`);
    }
    if (project.ncrs.length > 0) {
        readiness.blockers.push(`${project.ncrs.length} Non-Conformance Reports (NCRs) remain open.`);
    }
    if (project.punch_list_items.length > 0) {
        readiness.blockers.push(`${project.punch_list_items.length} Snag List (Punch) items are pending verification.`);
    }
    if (project.inspections.length === 0) {
        readiness.blockers.push("No passing Final Handover Inspection found.");
    }

    readiness.is_ready = readiness.blockers.length === 0;

    return readiness;
}

/**
 * Punch List CRUD
 */
async function getPunchList(projectId, user) {
    return await prisma.punchListItem.findMany({
        where: { project_id: projectId },
        include: {
            wbs: { select: { name: true, wbs_code: true } },
            raiser: { select: { name: true } },
            assignee: { select: { name: true } }
        },
        orderBy: { created_at: 'desc' }
    });
}

async function createPunchItem(projectId, data, user) {
    const itemNo = `SNAG-${projectId.slice(0,4)}-${Date.now().toString().slice(-4)}`;
    
    return await prisma.punchListItem.create({
        data: {
            project_id: projectId,
            company_id: user.companyId,
            item_no: itemNo,
            title: data.title,
            description: data.description,
            location: data.location,
            category: data.category,
            severity: data.severity || 'medium',
            wbs_id: data.wbs_id,
            raised_by: user.id,
            assigned_to: data.assigned_to,
            target_date: data.target_date ? new Date(data.target_date) : null
        }
    });
}

async function updatePunchStatus(id, status, user) {
    const updateData = { status };
    if (status === 'verified') {
        updateData.verified_at = new Date();
    }
    
    return await prisma.punchListItem.update({
        where: { id },
        data: updateData
    });
}

/**
 * Closure Management
 */
async function submitClosureRequest(projectId, data, user) {
    // 1. Re-verify readiness (Blocker)
    const readiness = await checkReadiness(projectId, user);
    if (!readiness.is_ready) {
        throw new Error(`Closure Denied: ${readiness.blockers.join(' ')}`);
    }

    const requestNo = `CLS-${projectId.slice(0,4)}-${Date.now().toString().slice(-4)}`;

    return await prisma.projectClosure.upsert({
        where: { project_id: projectId },
        update: {
            status: 'submitted',
            prepared_by: user.id,
            handover_date: data.handover_date ? new Date(data.handover_date) : null,
            completion_notes: data.notes,
            total_snags: readiness.stats.open_snags_count, // Should be 0 if logic holds
            wbs_completion: 100
        },
        create: {
            project_id: projectId,
            company_id: user.companyId,
            request_no: requestNo,
            status: 'submitted',
            prepared_by: user.id,
            handover_date: data.handover_date ? new Date(data.handover_date) : null,
            completion_notes: data.notes,
            total_snags: 0,
            cleared_snags: 0,
            wbs_completion: 100
        }
    });
}

async function getClosureStatus(projectId) {
    return await prisma.projectClosure.findUnique({
        where: { project_id: projectId },
        include: {
            preparer: { select: { name: true } }
        }
    });
}

module.exports = {
    checkReadiness,
    getPunchList,
    createPunchItem,
    updatePunchStatus,
    submitClosureRequest,
    getClosureStatus
};
