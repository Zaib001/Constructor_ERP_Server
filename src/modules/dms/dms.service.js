"use strict";

const db = require("../../db");
const crypto = require("crypto");
const storageService = require("../../services/storage.service");
const logger = require("../../logger");

async function generateDocCode(companyId) {
    const count = await db.document.count({ where: { company_id: companyId } });
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return `DOC-${ym}-${String(count + 1).padStart(4, "0")}`;
}

// ============================================================
// LIST & GET
// ============================================================
async function listDocuments(companyId, filters = {}) {
    const { page = 1, pageSize = 50, category, project_id, department_id, status } = filters;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const where = { company_id: companyId };
    if (category) where.category = category;
    if (project_id) where.project_id = project_id;
    if (department_id) where.department_id = department_id;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
        db.document.findMany({
            where,
            skip,
            take: parseInt(pageSize),
            include: {
                project: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
                versions: {
                    orderBy: { created_at: "desc" },
                    take: 1,
                    select: { id: true, version_number: true, status: true, published: true, original_filename: true, created_at: true }
                }
            },
            orderBy: { updated_at: "desc" }
        }),
        db.document.count({ where })
    ]);
    return { data, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

async function getDocumentById(id, companyId) {
    const doc = await db.document.findFirst({
        where: { id, company_id: companyId },
        include: {
            project: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            versions: {
                include: {
                    approvals: { include: { approver: { select: { id: true, name: true } } } }
                },
                orderBy: { created_at: "desc" }
            },
            access_logs: {
                take: 20,
                orderBy: { created_at: "desc" },
                include: { user: { select: { id: true, name: true } } }
            }
        }
    });
    if (!doc) throw new Error("Document not found.");
    return doc;
}

// ============================================================
// UPLOAD (new document + v1.0)
// ============================================================
async function uploadDocument(fileBuffer, fileInfo, body, user) {
    const companyId = user.companyId;
    const { title, category, project_id, department_id, changelog } = body;
    if (!title || !category) throw new Error("title and category are required.");

    const checksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // Duplicate detection: same checksum in same company+category+project
    const duplicateVersion = await db.documentVersion.findFirst({
        where: {
            checksum,
            document: { company_id: companyId, category, project_id: project_id || null }
        }
    });
    if (duplicateVersion) {
        throw new Error(
            `Duplicate document detected (checksum match). Existing version ID: ${duplicateVersion.id}. ` +
            `Use the versioning endpoint /:id/versions to upload a new version.`
        );
    }

    const stored = await storageService.uploadFile(fileBuffer, fileInfo.originalname, `documents/${companyId}`);
    const document_code = await generateDocCode(companyId);

    return db.$transaction(async (tx) => {
        const doc = await tx.document.create({
            data: {
                company_id: companyId,
                document_code,
                title,
                category,
                project_id: project_id || null,
                department_id: department_id || null,
                status: "DRAFT"
            }
        });

        const version = await tx.documentVersion.create({
            data: {
                document_id: doc.id,
                version_number: "1.0",
                storage_path: stored.path,
                checksum,
                mime_type: fileInfo.mimetype,
                file_size: fileBuffer.length,
                original_filename: fileInfo.originalname,
                changelog: changelog || "Initial upload",
                uploaded_by: user.userId,
                status: "PENDING_APPROVAL",
                published: false
            }
        });

        logger.info(`[DMS] Document ${document_code} created with version 1.0 by user ${user.userId}`);
        return { document: doc, version };
    });
}

// ============================================================
// VERSION — Upload new version for existing document
// ============================================================
async function uploadVersion(documentId, fileBuffer, fileInfo, body, user) {
    const companyId = user.companyId;
    const doc = await db.document.findFirst({ where: { id: documentId, company_id: companyId } });
    if (!doc) throw new Error("Document not found.");

    const checksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // Block identical file unless force_override
    if (!body.force_override) {
        const existing = await db.documentVersion.findFirst({
            where: { document_id: documentId, checksum }
        });
        if (existing) {
            throw new Error(
                `File is identical to existing version ${existing.version_number}. ` +
                `Pass force_override=true to upload anyway.`
            );
        }
    }

    // Calculate next version number
    const versions = await db.documentVersion.findMany({
        where: { document_id: documentId },
        orderBy: { created_at: "desc" }
    });
    const lastVersion = versions[0]?.version_number || "1.0";
    const [major, minor] = lastVersion.split(".").map(Number);
    const newVersion = body.major_version ? `${major + 1}.0` : `${major}.${minor + 1}`;

    const stored = await storageService.uploadFile(fileBuffer, fileInfo.originalname, `documents/${companyId}`);

    const version = await db.documentVersion.create({
        data: {
            document_id: documentId,
            version_number: newVersion,
            storage_path: stored.path,
            checksum,
            mime_type: fileInfo.mimetype,
            file_size: fileBuffer.length,
            original_filename: fileInfo.originalname,
            changelog: body.changelog || null,
            uploaded_by: user.userId,
            status: "PENDING_APPROVAL",
            published: false
        }
    });

    logger.info(`[DMS] Document ${documentId} new version ${newVersion} uploaded by ${user.userId}`);
    return version;
}

// ============================================================
// VERSION APPROVAL (version-specific, not parent doc)
// ============================================================
async function approveVersion(versionId, companyId, approverId, reason) {
    const version = await db.documentVersion.findFirst({
        where: { id: versionId, document: { company_id: companyId } }
    });
    if (!version) throw new Error("Document version not found.");
    if (version.status === "APPROVED") throw new Error("Version is already approved.");

    await db.documentApproval.create({
        data: { document_version_id: versionId, approver_id: approverId, status: "APPROVED", reason: reason || null }
    });

    return db.documentVersion.update({ where: { id: versionId }, data: { status: "APPROVED" } });
}

async function rejectVersion(versionId, companyId, approverId, reason) {
    if (!reason) throw new Error("Rejection reason is required.");

    const version = await db.documentVersion.findFirst({
        where: { id: versionId, document: { company_id: companyId } }
    });
    if (!version) throw new Error("Document version not found.");

    await db.documentApproval.create({
        data: { document_version_id: versionId, approver_id: approverId, status: "REJECTED", reason }
    });

    return db.documentVersion.update({ where: { id: versionId }, data: { status: "REJECTED" } });
}

// ============================================================
// PUBLISH
// ============================================================
async function publishVersion(versionId, companyId) {
    const version = await db.documentVersion.findFirst({
        where: { id: versionId, document: { company_id: companyId } }
    });
    if (!version) throw new Error("Document version not found.");
    if (version.status !== "APPROVED") throw new Error("Only approved versions can be published.");

    // Unpublish all sibling versions
    await db.documentVersion.updateMany({
        where: { document_id: version.document_id, published: true },
        data: { published: false }
    });

    const updated = await db.documentVersion.update({
        where: { id: versionId },
        data: { published: true }
    });

    await db.document.update({
        where: { id: version.document_id },
        data: { status: "PUBLISHED" }
    });

    return updated;
}

// ============================================================
// SECURE DOWNLOAD with Audit Log
// ============================================================
async function downloadDocument(versionId, companyId, userId, ipAddress) {
    const version = await db.documentVersion.findFirst({
        where: { id: versionId, document: { company_id: companyId } },
        include: { document: true }
    });
    if (!version) throw new Error("Document version not found.");

    await db.documentAccessLog.create({
        data: {
            document_id: version.document_id,
            user_id: userId,
            action: "DOWNLOAD",
            ip_address: ipAddress || null
        }
    });

    return version;
}

module.exports = {
    listDocuments,
    getDocumentById,
    uploadDocument,
    uploadVersion,
    approveVersion,
    rejectVersion,
    publishVersion,
    downloadDocument
};
