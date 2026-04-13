"use strict";

const prisma = require("../../db");

/**
 * Get all settings, optionally filtered by company and/or category.
 */
async function getAllSettings({ companyId, category } = {}) {
    const where = {};
    if (companyId) where.company_id = companyId;
    if (category) where.category = category;
    return await prisma.systemSetting.findMany({ where, orderBy: { key: "asc" } });
}

/**
 * Get a setting value by key (and optional company).
 */
async function getSetting(key, companyId = null) {
    const setting = await prisma.systemSetting.findFirst({
        where: { key, company_id: companyId || null }
    });
    return setting;
}

/**
 * Get the numeric value of a setting (e.g. PO_APPROVAL_THRESHOLD).
 */
async function getSettingValue(key, companyId = null) {
    const setting = await getSetting(key, companyId);
    return setting ? setting.value : null;
}

/**
 * Upsert a setting by key + company.
 */
async function upsertSetting({ key, value, label, description, category, companyId }) {
    // Check if exists
    const existing = await prisma.systemSetting.findFirst({
        where: { key, company_id: companyId || null }
    });
    if (existing) {
        return await prisma.systemSetting.update({
            where: { id: existing.id },
            data: { value: String(value), label, description, category, updated_at: new Date() }
        });
    }
    return await prisma.systemSetting.create({
        data: {
            key,
            value: String(value),
            label: label || key,
            description: description || null,
            category: category || "general",
            company_id: companyId || null
        }
    });
}

/**
 * Delete a setting.
 */
async function deleteSetting(id) {
    return await prisma.systemSetting.delete({ where: { id } });
}

module.exports = { getAllSettings, getSetting, getSettingValue, upsertSetting, deleteSetting };
