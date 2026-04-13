const prisma = require('../../db');
const logger = require('../../logger');

// Define industry-standard statuses for normalization
const STATUSES = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  ON_HOLD: 'ON_HOLD',
  DELAYED: 'DELAYED',
  COMPLETED: 'COMPLETED'
};

async function getPipelineData(companyId) {
  const projects = await prisma.project.findMany({
    where: { company_id: companyId, deleted_at: null },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      start_date: true,
      end_date: true,
      budget: true,
      cost: true,
      revenue: true,
      contract_value: true,
      current_contract_value: true,
      client: true,
      location: true,
      _count: {
        select: {
          employees: true,
          dprs: true,
          inspections: true,
          ncrs: true,
          safety_incidents: true,
          rfis: true,
          submittals: true
        }
      },
      progress: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { progress_pct: true }
      }
    }
  });

  // Group by status for Kanban and Normalize
  const pipeline = {
    [STATUSES.NOT_STARTED]: [],
    [STATUSES.IN_PROGRESS]: [],
    [STATUSES.ON_HOLD]: [],
    [STATUSES.DELAYED]: [],
    [STATUSES.COMPLETED]: []
  };

  projects.forEach(p => {
    // Normalize existing statuses like 'active' to 'IN_PROGRESS' for the pipeline view
    let status = p.status ? p.status.toUpperCase().replace(' ', '_') : STATUSES.NOT_STARTED;
    if (status === 'ACTIVE') status = STATUSES.IN_PROGRESS;
    
    // Safety check if status isn't in our map, put in most logical or Not Started
    if (!pipeline[status]) {
        status = STATUSES.NOT_STARTED;
    }

    const progress_pct = p.progress[0]?.progress_pct || 0;
    
    pipeline[status].push({
      ...p,
      progress_pct
    });
  });

  return pipeline;
}

async function updateStatus(projectId, newStatus, reason, userId) {
  const oldProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true }
  });

  if (!oldProject) throw new Error('Project not found');

  return prisma.$transaction(async (tx) => {
    // 1. Update project status
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { status: newStatus, updated_at: new Date() }
    });

    // 2. Create history log
    await tx.projectStatusLog.create({
      data: {
        project_id: projectId,
        old_status: oldProject.status,
        new_status: newStatus,
        reason: reason,
        updated_by: userId
      }
    });

    return updated;
  });
}

async function getStatusHistory(projectId) {
  return prisma.projectStatusLog.findMany({
    where: { project_id: projectId },
    include: {
      updater: {
        select: { name: true, designation: true }
      }
    },
    orderBy: { created_at: 'desc' }
  });
}

/**
 * Auto-update logic based on cumulative evidence
 */
async function triggerAutoUpdates(companyId) {
    const projects = await prisma.project.findMany({
        where: { company_id: companyId, deleted_at: null },
        include: {
            progress: { orderBy: { created_at: 'desc' }, take: 1 },
            dprs: { take: 1 } // Check if any DPR exists
        }
    });

    const updates = [];

    for (const p of projects) {
        let newStatus = null;
        const progress = p.progress[0]?.progress_pct || 0;
        const hasDPR = p.dprs.length > 0;
        const isPastDeadline = p.end_date && new Date() > new Date(p.end_date);
        const currentStatus = p.status?.toUpperCase();

        // Rule 1: Not Started with progress or DPR -> In Progress
        if (currentStatus === 'NOT_STARTED' || !currentStatus) {
            if (progress > 0 || hasDPR) newStatus = STATUSES.IN_PROGRESS;
        }

        // Rule 2: In Progress reaches 100% -> Completed
        if (currentStatus === 'IN_PROGRESS' || currentStatus === 'ACTIVE') {
            if (progress === 100) newStatus = STATUSES.COMPLETED;
            else if (isPastDeadline) newStatus = STATUSES.DELAYED;
        }

        if (newStatus && newStatus !== currentStatus) {
            updates.push(updateStatus(p.id, newStatus, 'System automated transition based on site data', null));
        }
    }

    if (updates.length > 0) {
        await Promise.all(updates);
        logger.info(`Automated Pipeline updates triggered for ${updates.length} projects`);
    }

    return updates.length;
}

module.exports = {
  getPipelineData,
  updateStatus,
  getStatusHistory,
  triggerAutoUpdates,
  STATUSES
};
