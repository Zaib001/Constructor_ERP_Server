const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

async function getAllItems(user, page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;
    const where = applyDataScope(user);
    
    const [data, total] = await Promise.all([
        prisma.item.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" }
        }),
        prisma.item.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getItemById(id, user) {
    const where = applyDataScope(user);
    where.id = id;
    return await prisma.item.findFirst({
        where
    });
}

async function createItem(data, user) {
    const { companyId, isSuperAdmin } = user;
    const targetCompanyId = isSuperAdmin ? (data.company_id || companyId) : companyId;

    if (!data.name) throw new Error("Missing required fields: Item name is mandatory.");

    return await prisma.item.create({
        data: {
            company_id: targetCompanyId,
            name: data.name,
            category: data.category || null,
            unit: data.unit || null,
            description: data.description || null,
            standard_price: data.standard_price ? Number(data.standard_price) : 0
        }
    });
}

async function updateItem(id, data, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id, deleted_at: null };
    if (!isSuperAdmin) where.company_id = companyId;

    const item = await prisma.item.findFirst({ where });
    if (!item) throw new Error("Item not found or access denied.");

    return await prisma.item.update({
        where: { id },
        data: {
            name: data.name,
            category: data.category,
            unit: data.unit,
            description: data.description,
            standard_price: data.standard_price !== undefined ? Number(data.standard_price) : undefined,
            updated_at: new Date()
        }
    });
}

async function deleteItem(id, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id, deleted_at: null };
    if (!isSuperAdmin) where.company_id = companyId;

    const item = await prisma.item.findFirst({ where });
    if (!item) throw new Error("Item not found or access denied.");

    return await prisma.item.update({
        where: { id },
        data: { deleted_at: new Date() }
    });
}

module.exports = {
    getAllItems,
    getItemById,
    createItem,
    updateItem,
    deleteItem
};
