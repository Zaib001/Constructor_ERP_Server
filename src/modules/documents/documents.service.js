const prisma = require("../../db");
const { applyDataScope, MODULES } = require("../../utils/scoping");

// Company Documents
async function getAllCompanyDocuments(user, page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;
    const where = applyDataScope(user, { module: MODULES.DOCUMENTS, isWrite: false });
    
    const [data, total] = await Promise.all([
        prisma.companyDocument.findMany({
            where,
            skip,
            take: pageSize,
            include: {
                company: { select: { name: true } }
            },
            orderBy: { expiry_date: "asc" }
        }),
        prisma.companyDocument.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getCompanyDocumentById(id, user) {
    const where = applyDataScope(user, { module: MODULES.DOCUMENTS, isWrite: false });
    where.id = id;
    return await prisma.companyDocument.findFirst({
        where,
        include: {
            company: { select: { name: true } }
        }
    });
}

async function createCompanyDocument(data, companyId) {
    if (!data.type) throw new Error("Missing required fields: Document type is mandatory.");

    // Date Logic
    if (data.issue_date && data.expiry_date) {
        if (new Date(data.expiry_date) <= new Date(data.issue_date)) {
            throw new Error("Compliance Error: Expiry date must be after the issue date.");
        }
    }

    return await prisma.companyDocument.create({
        data: {
            company_id: companyId,
            type: data.type,
            document_number: data.document_number || null,
            issue_date: data.issue_date ? new Date(data.issue_date) : null,
            expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
            filing_date: data.filing_date ? new Date(data.filing_date) : null
        }
    });
}

async function updateCompanyDocument(id, data, user) {
    const where = applyDataScope(user, { module: MODULES.DOCUMENTS, isWrite: true });
    where.id = id;

    const doc = await prisma.companyDocument.findFirst({ where });
    if (!doc) throw new Error("Document not found or access denied.");

    return await prisma.companyDocument.update({
        where: { id },
        data: {
            type: data.type,
            document_number: data.document_number,
            issue_date: data.issue_date ? new Date(data.issue_date) : null,
            expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
            filing_date: data.filing_date ? new Date(data.filing_date) : null,
            updated_at: new Date()
        }
    });
}

async function deleteCompanyDocument(id, user) {
    const where = applyDataScope(user, { module: MODULES.DOCUMENTS, isWrite: true });
    where.id = id;

    const doc = await prisma.companyDocument.findFirst({ where });
    if (!doc) throw new Error("Document not found or access denied.");

    return await prisma.companyDocument.delete({ where: { id } });
}

// Facility Documents
async function getAllFacilityDocuments(user, page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;
    const where = applyDataScope(user, { module: MODULES.DOCUMENTS, isWrite: false });
    
    const [data, total] = await Promise.all([
        prisma.facilityDocument.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { expiry_date: "asc" }
        }),
        prisma.facilityDocument.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getFacilityDocumentById(id, user) {
    const where = applyDataScope(user, { module: MODULES.DOCUMENTS, isWrite: false });
    where.id = id;
    return await prisma.facilityDocument.findFirst({
        where,
    });
}

async function createFacilityDocument(data, companyId) {
    if (!data.type) throw new Error("Missing required fields: Document type is mandatory.");

    return await prisma.facilityDocument.create({
        data: {
            company_id: companyId,
            department: data.department || null,
            type: data.type,
            expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
            notes: data.notes || null
        }
    });
}

async function updateFacilityDocument(id, data, user) {
    const where = applyDataScope(user, { module: MODULES.DOCUMENTS, isWrite: true });
    where.id = id;

    const doc = await prisma.facilityDocument.findFirst({ where });
    if (!doc) throw new Error("Document not found or access denied.");

    return await prisma.facilityDocument.update({
        where: { id },
        data: {
            department: data.department,
            type: data.type,
            expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
            notes: data.notes,
            updated_at: new Date()
        }
    });
}

async function deleteFacilityDocument(id, user) {
    const where = applyDataScope(user, { module: MODULES.DOCUMENTS, isWrite: true });
    where.id = id;

    const doc = await prisma.facilityDocument.findFirst({ where });
    if (!doc) throw new Error("Document not found or access denied.");

    return await prisma.facilityDocument.delete({ where: { id } });
}

module.exports = {
    getAllCompanyDocuments,
    getCompanyDocumentById,
    createCompanyDocument,
    updateCompanyDocument,
    deleteCompanyDocument,
    getAllFacilityDocuments,
    getFacilityDocumentById,
    createFacilityDocument,
    updateFacilityDocument,
    deleteFacilityDocument
};
