"use strict";

const prisma = require("../../db");

async function getAllCompanies(user, page = 1, pageSize = 10, search = "") {
    if (!user.isSuperAdmin) throw new Error("Unauthorized: Super Admin access required.");
    const skip = (page - 1) * pageSize;
    const where = {
        is_active: true,
        OR: search ? [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } }
        ] : undefined
    };

    const [total, data] = await Promise.all([
        prisma.company.count({ where }),
        prisma.company.findMany({
            where,
            orderBy: { code: "asc" },
            skip,
            take: pageSize,
            include: {
                _count: { select: { departments: true, users: true, projects: true } }
            }
        })
    ]);

    return { data, total, page, pageSize };
}

async function getCompanyById(id, user) {
    if (!user.isSuperAdmin && user.companyId !== id) {
        throw new Error("Unauthorized: Access denied to this company.");
    }
    return await prisma.company.findUnique({
        where: { id },
        include: {
            departments: { where: { is_active: true }, orderBy: { name: "asc" } },
            _count: { select: { departments: true, users: true, projects: true } }
        }
    });
}

async function createCompany(data, user) {
    if (!user.isSuperAdmin) throw new Error("Unauthorized: Super Admin access required.");
    return await prisma.company.create({
        data: {
            code: data.code,
            name: data.name,
            address: data.address || null,
            phone: data.phone || null,
            email: data.email || null,
            registration_number: data.registration_number || null,
            vat_number: data.vat_number || null,
            is_active: true
        }
    });
}

async function updateCompany(id, data, user) {
    if (!user.isSuperAdmin) throw new Error("Unauthorized: Super Admin access required.");
    return await prisma.company.update({
        where: { id },
        data: {
            name: data.name,
            address: data.address,
            phone: data.phone,
            email: data.email,
            registration_number: data.registration_number,
            vat_number: data.vat_number,
            is_active: data.is_active,
            updated_at: new Date()
        }
    });
}

async function deleteCompany(id, user) {
    if (!user.isSuperAdmin) throw new Error("Unauthorized: Super Admin access required.");
    return await prisma.company.update({
        where: { id },
        data: { 
            is_active: false, 
            deleted_at: new Date(),
            updated_at: new Date() 
        }
    });
}

async function getCompanyPerformance(id, user) {
    if (!user.isSuperAdmin && user.companyId !== id) {
        throw new Error("Unauthorized: Access denied to this company performance data.");
    }
    const company = await prisma.company.findUnique({
        where: { id },
        include: {
            projects: {
                orderBy: { created_at: "desc" },
                select: { id: true, code: true, name: true, status: true, budget: true, revenue: true, cost: true }
            },
            departments: {
                where: { is_active: true },
                include: {
                    _count: { select: { users: true } }
                }
            },
            users: {
                where: { },
                select: { id: true, name: true, email: true, designation: true, employee_code: true, phone: true, is_active: true, role_id: true, roles: { select: { id: true, name: true } }, departments: { select: { id: true, name: true } } }
            }
        }
    });

    if (!company) return null;

    // Financial aggregation - Dynamic Real-Time Data
    const revenueAgg = await prisma.quotation.aggregate({
        where: { company_id: id, status: { in: ["approved", "accepted", "won"] } },
        _sum: { amount: true }
    });

    const poCost = await prisma.purchaseOrder.aggregate({
        where: { company_id: id, status: { in: ["approved", "issued"] } },
        _sum: { amount: true }
    });
    const payrollCost = await prisma.payroll.aggregate({
        where: { company_id: id, status: { in: ["processed", "approved", "paid"] } },
        _sum: { total_amount: true }
    });
    const expenseCost = await prisma.expense.aggregate({
        where: { company_id: id, status: { in: ["approved", "paid", "reimbursed"] } },
        _sum: { amount: true }
    });

    const totalRevenue = Number(revenueAgg._sum.amount || 0);
    const totalCost = Number(poCost._sum.amount || 0) + 
                      Number(payrollCost._sum.total_amount || 0) + 
                      Number(expenseCost._sum.amount || 0);
    const totalBudget = company.projects.reduce((sum, p) => sum + Number(p.budget || 0), 0);

    // Recent Financial Activity (Purchase Orders, Invoices etc from ApprovalRequests)
    const recentActivity = await prisma.approvalRequest.findMany({
        where: { company_id: id },
        orderBy: { created_at: "desc" },
        take: 10,
        select: { id: true, doc_type: true, doc_id: true, current_status: true, amount: true, created_at: true }
    });

    return {
        id: company.id,
        name: company.name,
        code: company.code,
        address: company.address,
        phone: company.phone,
        email: company.email,
        registration_number: company.registration_number,
        vat_number: company.vat_number,
        stats: {
            totalRevenue,
            totalCost,
            profit: totalRevenue - totalCost,
            totalBudget,
            revenueTarget: totalBudget, // Assuming budget is the target for now
            projectCount: company.projects.length,
            deptCount: company.departments.length,
            staffCount: company.users.length
        },
        projects: company.projects.map(p => ({
            ...p,
            profit: Number(p.revenue || 0) - Number(p.cost || 0)
        })),
        departments: company.departments.map(d => ({
            id: d.id,
            name: d.name,
            code: d.code,
            staffCount: d._count.users
        })),
        staff: company.users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            designation: u.designation,
            employee_code: u.employee_code,
            phone: u.phone,
            is_active: u.is_active,
            role: u.roles?.name,
            role_id: u.role_id,
            department: u.departments?.name || null,
            department_id: u.departments?.id || null
        })),
        recentActivity
    };
}

module.exports = { getAllCompanies, getCompanyById, createCompany, updateCompany, deleteCompany, getCompanyPerformance };
