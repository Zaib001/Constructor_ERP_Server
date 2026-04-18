const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

async function createProgress(data, user, actorId) {
    const project = await prisma.project.findFirst({
        where: { ...applyDataScope(user, { projectFilter: true, includeDeleted: true, projectModel: true }), id: data.project_id }
    });
    if (!project) throw new Error("Project not found or access denied");

    return await prisma.projectProgress.create({
        data: {
            project_id: data.project_id,
            description: data.description || null,
            progress_pct: data.progress_pct ? Number(data.progress_pct) : 0,
            attachment_url: data.attachment_url || null,
            created_by: actorId
        }
    });
}

async function getProgressByProject(projectId, user) {
    const project = await prisma.project.findFirst({
        where: { ...applyDataScope(user, { projectFilter: true, includeDeleted: true, projectModel: true }), id: projectId }
    });
    if (!project) throw new Error("Project not found or access denied");

    const [executionOverview, recentLogs] = await Promise.all([
        // 1. Get high-level WBS nodes (Execution Overview)
        prisma.wBS.findMany({
            where: { project_id: projectId, parent_id: null },
            select: { id: true, name: true, progress_pct: true, wbs_code: true },
            orderBy: { wbs_code: "asc" }
        }),
        // 2. Get site diaries / document logs
        prisma.projectProgress.findMany({
            where: { project_id: projectId },
            orderBy: { created_at: "desc" },
            include: {
                creator: { select: { id: true, name: true } }
            }
        })
    ]);

    return { executionOverview, recentLogs };
}

module.exports = { createProgress, getProgressByProject };
