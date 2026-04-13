"use strict";

const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");
const deliverySvc = require("../execution/delivery/delivery.service");
const mobSvc = require("../execution/mobilization/mobilization.service");

/**
 * Superadmin Dashboard - Consolidated group-level metrics.
 */
async function getSuperadminDashboard() {
    // 1. Core Fetching (Independent stats)
    const [companies, pendingApprovals, totalPos, totalVendors, delayedDeliveries, pendingMobilizations, profitShareRules] = await Promise.all([
        prisma.company.findMany({
            where: { is_active: true },
            include: {
                _count: { select: { departments: true, users: true, projects: true } },
                projects: {
                    where: { status: "active" },
                    select: { id: true, name: true, budget: true }
                }
            }
        }),
        prisma.approvalRequest.count({
            where: { is_completed: false }
        }),
        prisma.purchaseOrder.count(),
        prisma.vendor.count(),
        deliverySvc.getOverdueDeliveriesCount(undefined), // Group wide
        mobSvc.getPendingMobilizationCount(undefined),
        prisma.profitShareRule.findMany({
            where: { is_active: true },
            include: {
                company: { select: { name: true } },
                department: { select: { name: true } },
                project: { select: { name: true, revenue: true, cost: true } }
            }
        })
    ]);

    const companyIds = companies.map(c => c.id);
    const allProjects = companies.flatMap(c => c.projects);
    const projectIds = allProjects.map(p => p.id);

    // 2. Bulk Aggregations (Financials)
    const [revAgg, poAgg, payrollAgg, expenseAgg, inventoryAgg] = await Promise.all([
        prisma.quotation.groupBy({
            by: ['company_id'],
            where: { company_id: { in: companyIds }, status: { in: ["approved", "accepted", "won"] } },
            _sum: { amount: true }
        }),
        prisma.purchaseOrder.groupBy({
            by: ['company_id'],
            where: { company_id: { in: companyIds }, status: { in: ["approved", "issued"] } },
            _sum: { amount: true }
        }),
        prisma.payroll.groupBy({
            by: ['company_id'],
            where: { company_id: { in: companyIds }, status: { in: ["processed", "approved", "paid"] } },
            _sum: { total_amount: true }
        }),
        prisma.expense.groupBy({
            by: ['company_id'],
            where: { company_id: { in: companyIds }, status: { in: ["approved", "paid", "reimbursed"] } },
            _sum: { amount: true }
        }),
        prisma.inventoryStock.findMany({
            where: { company_id: { in: companyIds } },
            include: { item: { select: { standard_price: true } } }
        })
    ]);

    // 3. Transform to efficient maps
    const revMap = new Map(revAgg.map(a => [a.company_id, Number(a._sum.amount || 0)]));
    const poMap = new Map(poAgg.map(a => [a.company_id, Number(a._sum.amount || 0)]));
    const payMap = new Map(payrollAgg.map(a => [a.company_id, Number(a._sum.total_amount || 0)]));
    const expMap = new Map(expenseAgg.map(a => [a.company_id, Number(a._sum.amount || 0)]));
    
    const invMap = new Map();
    inventoryAgg.forEach(stock => {
        const val = Number(stock.quantity) * Number(stock.item?.standard_price || 0);
        invMap.set(stock.company_id, (invMap.get(stock.company_id) || 0) + val);
    });

    const companyPerformance = companies.map(c => {
        const totalRevenue = revMap.get(c.id) || 0;
        const totalCost = (poMap.get(c.id) || 0) + (payMap.get(c.id) || 0) + (expMap.get(c.id) || 0);
        const inventoryValuation = invMap.get(c.id) || 0;

        return {
            id: c.id,
            name: c.name,
            code: c.code,
            departments: c._count.departments,
            employees: c._count.users,
            projects: c._count.projects,
            totalRevenue,
            totalCost,
            profit: totalRevenue - totalCost,
            totalBudget: c.projects.reduce((sum, p) => sum + Number(p.budget || 0), 0),
            inventoryValuation
        };
    });

    const groupRevenue = companyPerformance.reduce((s, c) => s + c.totalRevenue, 0);
    const groupCost = companyPerformance.reduce((s, c) => s + c.totalCost, 0);

    // 4. Project Cost Centers (Bulk)
    const [projPoAgg, projExpAgg] = await Promise.all([
        prisma.purchaseOrder.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "issued"] } },
            _sum: { amount: true }
        }),
        prisma.expense.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "paid", "reimbursed"] } },
            _sum: { amount: true }
        })
    ]);

    const pPoMap = new Map(projPoAgg.map(a => [a.project_id, Number(a._sum.amount || 0)]));
    const pExMap = new Map(projExpAgg.map(a => [a.project_id, Number(a._sum.amount || 0)]));

    const topCostCenters = allProjects.map(p => ({
        name: p.name,
        cost: (pPoMap.get(p.id) || 0) + (pExMap.get(p.id) || 0)
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

    return {
        groupRevenue,
        groupCost,
        groupProfit: groupRevenue - groupCost,
        pendingApprovals,
        outstandingReceivables: allProjects.reduce((sum, p) => sum + Number(p.budget || 0), 0),
        cashFlow: groupRevenue - groupCost,
        totalInventoryValuation: companyPerformance.reduce((s, c) => s + (c.inventoryValuation || 0), 0),
        companyPerformance,
        deptProfitShares: profitShareRules.map(rule => ({
            id: rule.id,
            name: rule.name,
            entityType: rule.entity_type,
            company: rule.company?.name,
            department: rule.department?.name,
            project: rule.project?.name,
            partnerA: { name: rule.partner_a_name, share: rule.partner_a_share },
            partnerB: { name: rule.partner_b_name, share: rule.partner_b_share }
        })),
        topCostCenters,
        stats: {
            totalCompanies: companies.length,
            totalProjects: allProjects.length,
            totalVendors,
            totalPos,
            delayedDeliveries,
            pendingMobilizations
        }
    };
}

/**
 * Department Head Dashboard.
 */
async function getDeptHeadDashboard(userId, userObj) {
    // 1. Core Fetching (Parallelize independent queries)
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { departments: { include: { company: true } } }
    });

    if (!user?.department_id) {
        return { error: "User is not assigned to any department" };
    }

    const deptId = user.department_id;

    const [employees, pendingApprovals, poAgg, payAgg, expAgg] = await Promise.all([
        prisma.user.findMany({
            where: applyDataScope(userObj, { departmentFilter: true }),
            select: { id: true, name: true, designation: true, is_active: true }
        }),
        prisma.approvalRequest.count({ where: { department_id: deptId, is_completed: false } }),
        prisma.purchaseOrder.aggregate({
            where: { department_id: deptId, status: { in: ["approved", "issued", "pending", "draft", "in_approval"] } },
            _sum: { amount: true }
        }),
        prisma.payroll.aggregate({
            where: { department_id: deptId, status: { in: ["processed", "approved", "paid", "pending", "draft", "in_approval"] } },
            _sum: { total_amount: true }
        }),
        prisma.expense.aggregate({
            where: { department_id: deptId, status: { in: ["approved", "paid", "reimbursed", "pending", "draft", "in_approval"] } },
            _sum: { amount: true }
        })
    ]);

    // 2. Department projects
    const deptUsers = employees.map(e => e.id);
    const userProjects = await prisma.userProject.findMany({
        where: { user_id: { in: deptUsers }, revoked_at: null },
        include: {
            projects: { select: { id: true, name: true, status: true, budget: true, revenue: true, cost: true } }
        }
    });

    const projectSet = new Map();
    userProjects.forEach(up => {
        if (up.projects) projectSet.set(up.projects.id, up.projects);
    });
    const projects = Array.from(projectSet.values());
    const projectIds = projects.map(p => p.id);

    // 3. Project Financials (Bulk Aggregation)
    const [pRevAgg, pPoAgg, pExAgg] = await Promise.all([
        prisma.quotation.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "accepted", "won"] } },
            _sum: { amount: true }
        }),
        prisma.purchaseOrder.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "issued"] } },
            _sum: { amount: true }
        }),
        prisma.expense.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "paid", "reimbursed"] } },
            _sum: { amount: true }
        })
    ]);

    const rMap = new Map(pRevAgg.map(a => [a.project_id, Number(a._sum.amount || 0)]));
    const poMap = new Map(pPoAgg.map(a => [a.project_id, Number(a._sum.amount || 0)]));
    const exMap = new Map(pExAgg.map(a => [a.project_id, Number(a._sum.amount || 0)]));

    const projectsWithFinancials = projects.map(p => {
        const rev = rMap.get(p.id) || 0;
        const cost = (poMap.get(p.id) || 0) + (exMap.get(p.id) || 0);
        return {
            id: p.id, name: p.name, status: p.status, budget: p.budget,
            revenue: rev, cost, profit: rev - cost
        };
    });

    const totalRevenue = projectsWithFinancials.reduce((s, p) => s + p.revenue, 0);
    const totalDeptExpenses = 
        Number(poAgg._sum.amount || 0) + 
        Number(payAgg._sum.total_amount || 0) + 
        Number(expAgg._sum.amount || 0);

    const deptProfit = totalRevenue - totalDeptExpenses;
    const totalBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);

    return {
        companyName: user.departments?.company?.name || "Unassigned Company",
        departmentName: user.departments?.name,
        departmentCode: user.departments?.code,
        employeeCount: employees.length,
        projectCount: projects.length,
        totalRevenue,
        totalDeptExpenses,
        profit: deptProfit,
        deptHeadProfitShare: deptProfit > 0 ? (deptProfit * 0.5) : 0,
        totalBudget,
        budgetUtilization: totalBudget > 0 ? ((totalDeptExpenses / totalBudget) * 100).toFixed(1) : 0,
        pendingApprovals,
        projects: projectsWithFinancials,
        staffProductivity: employees.map(e => ({
            id: e.id, name: e.name, designation: e.designation,
            activeProjects: userProjects.filter(up => up.user_id === e.id).length
        }))
    };
}

/**
 * Project Manager / Site Dashboard - strictly scoped to assigned projects.
 */
async function getProjectDashboard(user) {
    let projects = [];
    if (user.isSuperAdmin) {
        projects = await prisma.project.findMany({
            where: { deleted_at: null },
            select: { id: true, name: true, status: true, budget: true, code: true }
        });
    } else if (["erp_admin", "procurement_officer", "accounts_officer", "hr_admin", "auditor_readonly"].includes(user.roleCode)) {
        projects = await prisma.project.findMany({
            where: { company_id: user.companyId, deleted_at: null },
            select: { id: true, name: true, status: true, budget: true, code: true }
        });
    } else {
        const assignments = await prisma.userProject.findMany({
            where: { user_id: user.id, revoked_at: null },
            include: {
                projects: {
                    select: { id: true, name: true, status: true, budget: true, code: true, company_id: true, deleted_at: true }
                }
            }
        });
        projects = assignments
            .map(up => up.projects)
            .filter(p => !!p && p.deleted_at === null && p.company_id === user.companyId);
    }

    const projectIds = projects.map(p => p.id);

    // 1. Bulk Aggregations & Global Stats
    const [pendingApprovals, recentPRs, logistics, prAgg, poAgg, pettyAgg, petroAgg, quotAgg] = await Promise.all([
        prisma.approvalRequest.count({ where: { project_id: { in: projectIds }, is_completed: false } }),
        prisma.purchaseRequisition.findMany({
            where: { project_id: { in: projectIds }, deleted_at: null },
            take: 10, orderBy: { created_at: "desc" },
            include: { requester: { select: { name: true } } }
        }),
        Promise.all([
            deliverySvc.getOverdueDeliveriesCount(user.companyId),
            mobSvc.getPendingMobilizationCount(user.companyId)
        ]),
        // Financials (Bulk)
        prisma.purchaseRequisitionItem.groupBy({
            by: ['requisition_id'],
            where: { requisition: { project_id: { in: projectIds }, status: { in: ["approved_for_rfq", "submitted"] } } },
            _sum: { estimated_total_price: true }
        }),
        prisma.purchaseOrder.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "issued", "received"] } },
            _sum: { amount: true }
        }),
        prisma.pettyCashRequest.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "settled"] } },
            _sum: { estimated_cost: true }
        }),
        prisma.petrolExpense.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, verification_status: "verified", deleted_at: null },
            _sum: { total_amount: true }
        }),
        prisma.quotation.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "accepted", "won"] } },
            _sum: { amount: true }
        })
    ]);

    // 2. Map PR items back to projects (Since PRItem is linked via PR)
    // First get PR -> Project mapping
    const prs = await prisma.purchaseRequisition.findMany({
        where: { id: { in: prAgg.map(a => a.requisition_id) } },
        select: { id: true, project_id: true }
    });
    const prToProj = new Map(prs.map(p => [p.id, p.project_id]));
    const prProjectMap = new Map();
    prAgg.forEach(a => {
        const pId = prToProj.get(a.requisition_id);
        if (pId) prProjectMap.set(pId, (prProjectMap.get(pId) || 0) + Number(a._sum.estimated_total_price || 0));
    });

    // 3. Transform Maps
    const poMap = new Map(poAgg.map(a => [a.project_id, Number(a._sum.amount || 0)]));
    const pettyMap = new Map(pettyAgg.map(a => [a.project_id, Number(a._sum.estimated_cost || 0)]));
    const petroMap = new Map(petroAgg.map(a => [a.project_id, Number(a._sum.total_amount || 0)]));
    const quotMap = new Map(quotAgg.map(a => [a.project_id, Number(a._sum.amount || 0)]));

    const projectsWithFinancials = projects.map(p => {
        const prCost = prProjectMap.get(p.id) || 0;
        const poCost = poMap.get(p.id) || 0;
        const pettyCost = pettyMap.get(p.id) || 0;
        const petrolCost = petroMap.get(p.id) || 0;
        const totalCost = prCost + poCost + pettyCost + petrolCost;
        
        const quotationRevenue = quotMap.get(p.id) || 0;
        const revenue = quotationRevenue > 0 ? quotationRevenue : Number(p.budget || 0);

        return {
            id: p.id, name: p.name, code: p.code,
            budget: Number(p.budget || 0), revenue, cost: totalCost,
            profit: revenue - totalCost,
            breakdown: { prCommitted: prCost, poIssued: poCost, pettyCash: pettyCost, payroll: 0, petrol: petrolCost }
        };
    });

    const totalRevenue = projectsWithFinancials.reduce((s, p) => s + p.revenue, 0);
    const totalCost = projectsWithFinancials.reduce((s, p) => s + p.cost, 0);

    return {
        projectCount: projects.length,
        totalRevenue, totalCost, profit: totalRevenue - totalCost,
        totalBudget: projects.reduce((s, p) => s + Number(p.budget || 0), 0),
        pendingApprovals,
        projects: projectsWithFinancials,
        logistics: { delayedDeliveries: logistics[0], pendingMobilizations: logistics[1] },
        recentActivity: recentPRs.map(pr => ({
            id: pr.id, type: "PR", ref: pr.pr_no, status: pr.status,
            creator: pr.requester?.name, date: pr.created_at
        }))
    };
}


/**
 * Company Head Dashboard - Metrics for a single legal entity.
 */
async function getCompanyHeadDashboard(userId, userObj) {
    const companyId = userObj.companyId;

    // 1. Core Fetching (Parallel)
    const [company, companyUsers, revAgg, poAgg, payAgg, expAgg, inventoryAgg] = await Promise.all([
        prisma.company.findUnique({
            where: { id: companyId },
            include: {
                _count: { select: { departments: true, users: true, projects: true } },
                projects: { where: { status: "active" }, select: { id: true, name: true, budget: true } }
            }
        }),
        prisma.user.findMany({ where: { company_id: companyId, deleted_at: null }, select: { id: true } }),
        // Financials
        prisma.quotation.aggregate({
            where: { company_id: companyId, status: { in: ["approved", "accepted", "won"] } },
            _sum: { amount: true }
        }),
        prisma.purchaseOrder.aggregate({
            where: { company_id: companyId, status: { in: ["approved", "issued"] } },
            _sum: { amount: true }
        }),
        prisma.payroll.aggregate({
            where: { company_id: companyId, status: { in: ["processed", "approved", "paid"] } },
            _sum: { total_amount: true }
        }),
        prisma.expense.aggregate({
            where: { company_id: companyId, status: { in: ["approved", "paid", "reimbursed"] } },
            _sum: { amount: true }
        }),
        prisma.inventoryStock.findMany({
            where: { company_id: companyId },
            include: { item: { select: { standard_price: true } } }
        })
    ]);

    if (!company) return { error: "Company not found" };

    const totalRevenue = Number(revAgg._sum.amount || 0);
    const totalCost = Number(poAgg._sum.amount || 0) + Number(payAgg._sum.total_amount || 0) + Number(expAgg._sum.amount || 0);
    const profit = totalRevenue - totalCost;

    const inventoryValuation = inventoryAgg.reduce((sum, stock) => {
        return sum + (Number(stock.quantity) * Number(stock.item?.standard_price || 0));
    }, 0);

    // 2. Specialized Project/Approval Stats (Parallel)
    const projectIds = company.projects.map(p => p.id);
    const [pendingApprovals, projPoAgg, projExpAgg] = await Promise.all([
        prisma.approvalRequest.count({
            where: { requested_by: { in: companyUsers.map(u => u.id) }, is_completed: false }
        }),
        prisma.purchaseOrder.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "issued"] } },
            _sum: { amount: true }
        }),
        prisma.expense.groupBy({
            by: ['project_id'],
            where: { project_id: { in: projectIds }, status: { in: ["approved", "paid", "reimbursed"] } },
            _sum: { amount: true }
        })
    ]);

    const pPoMap = new Map(projPoAgg.map(a => [a.project_id, Number(a._sum.amount || 0)]));
    const pExMap = new Map(projExpAgg.map(a => [a.project_id, Number(a._sum.amount || 0)]));

    const topCostCenters = company.projects.map(p => ({
        name: p.name,
        cost: (pPoMap.get(p.id) || 0) + (pExMap.get(p.id) || 0)
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

    return {
        companyName: company.name,
        companyCode: company.code,
        totalRevenue,
        totalCost,
        profit,
        totalInventoryValuation: inventoryValuation,
        pendingApprovals,
        topCostCenters,
        stats: {
            totalDepartments: company._count.departments,
            totalProjects: company._count.projects,
            totalEmployees: company._count.users
        }
    };
}

/**
 * Compliance & Expiry Dashboard - Centralized alerts for Workforce, Fleet, Legal & Financials.
 */
async function getComplianceDashboard(user) {
    // Default window is 30 days
    const today = new Date();
    const windowDate = new Date();
    windowDate.setDate(today.getDate() + 30);

    const baseWhere = applyDataScope(user);

    // --- 1. Workforce (Employees) ---
    const employeeCondition = {
        OR: [
            { iqama_expiry: { lte: windowDate } },
            { passport_expiry: { lte: windowDate } },
            { insurance_expiry: { lte: windowDate } },
            { contract_renewal_date: { lte: windowDate } }
        ],
        ...baseWhere
    };
    if (!user.isSuperAdmin && user.departmentId) {
        employeeCondition.department_id = user.departmentId;
    }

    const employees = await prisma.employee.findMany({
        where: employeeCondition,
        select: {
            id: true,
            name: true,
            iqama_no: true,
            iqama_expiry: true,
            passport_no: true,
            passport_expiry: true,
            insurance_no: true,
            insurance_expiry: true,
            contract_renewal_date: true
        }
    });

    const workforceAlerts = employees.flatMap(emp => {
        const alerts = [];
        if (emp.iqama_expiry && emp.iqama_expiry <= windowDate) {
            alerts.push({ id: emp.id, name: emp.name, type: "Iqama", date: emp.iqama_expiry, ref: emp.iqama_no });
        }
        if (emp.passport_expiry && emp.passport_expiry <= windowDate) {
            alerts.push({ id: emp.id, name: emp.name, type: "Passport", date: emp.passport_expiry, ref: emp.passport_no });
        }
        if (emp.insurance_expiry && emp.insurance_expiry <= windowDate) {
            alerts.push({ id: emp.id, name: emp.name, type: "Insurance", date: emp.insurance_expiry, ref: emp.insurance_no });
        }
        if (emp.contract_renewal_date && emp.contract_renewal_date <= windowDate) {
            alerts.push({ id: emp.id, name: emp.name, type: "Contract Renewal", date: emp.contract_renewal_date });
        }
        return alerts;
    });

    // --- 2. Fleet & Assets (Vehicles & Equipment) ---
    const vehicleCondition = {
        OR: [
            { registration_expiry: { lte: windowDate } },
            { insurance_expiry: { lte: windowDate } },
            { mvpi_expiry: { lte: windowDate } },
            { fitness_expiry_date: { lte: windowDate } }
        ],
        ...baseWhere
    };
    const equipmentCondition = {
        OR: [
            { registration_expiry: { lte: windowDate } },
            { insurance_expiry: { lte: windowDate } },
            { third_party_certification_validity: { lte: windowDate } },
            { preventive_maintenance_date: { lte: windowDate } }
        ],
        ...baseWhere
    };

    const [vehicles, equipment] = await Promise.all([
        prisma.vehicle.findMany({ where: vehicleCondition }),
        prisma.equipment.findMany({ where: equipmentCondition })
    ]);

    const fleetAlerts = [
        ...vehicles.flatMap(v => {
            const alerts = [];
            if (v.registration_expiry && v.registration_expiry <= windowDate) alerts.push({ id: v.id, name: `Vehicle ${v.vehicle_no}`, type: "Registration", date: v.registration_expiry });
            if (v.insurance_expiry && v.insurance_expiry <= windowDate) alerts.push({ id: v.id, name: `Vehicle ${v.vehicle_no}`, type: "Insurance", date: v.insurance_expiry });
            if (v.mvpi_expiry && v.mvpi_expiry <= windowDate) alerts.push({ id: v.id, name: `Vehicle ${v.vehicle_no}`, type: "MVPI", date: v.mvpi_expiry });
            return alerts;
        }),
        ...equipment.flatMap(e => {
            const alerts = [];
            if (e.registration_expiry && e.registration_expiry <= windowDate) alerts.push({ id: e.id, name: e.name, type: "Registration", date: e.registration_expiry });
            if (e.third_party_certification_validity && e.third_party_certification_validity <= windowDate) alerts.push({ id: e.id, name: e.name, type: "Certification", date: e.third_party_certification_validity });
            if (e.preventive_maintenance_date && e.preventive_maintenance_date <= windowDate) alerts.push({ id: e.id, name: e.name, type: "Maintenance", date: e.preventive_maintenance_date });
            return alerts;
        })
    ];

    // --- 3. Legal & Facilities (Documents) ---
    const docCondition = { expiry_date: { lte: windowDate }, ...baseWhere };
    const [compDocs, facDocs] = await Promise.all([
        prisma.companyDocument.findMany({ where: docCondition }),
        prisma.facilityDocument.findMany({ where: docCondition })
    ]);

    const legalAlerts = [
        ...compDocs.map(d => ({ id: d.id, name: d.type, type: "Legal Document", date: d.expiry_date, ref: d.document_number })),
        ...facDocs.map(d => ({ id: d.id, name: d.type, type: "Facility Document", date: d.expiry_date }))
    ];

    // --- 4. Financials (Supplier Invoices) ---
    const overdueInvoices = await prisma.supplierInvoice.findMany({
        where: {
            due_date: { lte: windowDate },
            status: { notIn: ["paid", "cancelled"] },
            ...(user.isSuperAdmin ? {} : { vendor: { company_id: user.companyId } })
        },
        include: { vendor: { select: { name: true } } }
    });

    const financialAlerts = overdueInvoices.map(i => ({
        id: i.id,
        name: `Invoice ${i.invoice_number}`,
        type: "Supplier Payment",
        date: i.due_date,
        ref: i.vendor?.name,
        amount: i.total_amount
    }));

    return {
        summary: {
            total: workforceAlerts.length + fleetAlerts.length + legalAlerts.length + financialAlerts.length,
            expired: [...workforceAlerts, ...fleetAlerts, ...legalAlerts, ...financialAlerts].filter(a => a.date < today).length,
            upcoming: [...workforceAlerts, ...fleetAlerts, ...legalAlerts, ...financialAlerts].filter(a => a.date >= today).length
        },
        workforce: workforceAlerts.sort((a, b) => a.date - b.date),
        fleet: fleetAlerts.sort((a, b) => a.date - b.date),
        legal: legalAlerts.sort((a, b) => a.date - b.date),
        financial: financialAlerts.sort((a, b) => a.date - b.date)
    };
}

/**
 * Workspace Summary for individual users - Lightweight KPI aggregation.
 */
async function getWorkspaceSummary(user) {
    const userId = user.id;

    // 1. Get assigned projects
    const projectScope = applyDataScope(user, { projectFilter: true, projectModel: true });
    projectScope.status = "active";
    const projects = await prisma.project.findMany({
        where: projectScope,
        select: { id: true }
    });
    const projectIds = projects.map(p => p.id);

    // 2. Metrics
    const [pendingApprovals, progressCount] = await Promise.all([
        // Approvals pending for projects or requested by user
        prisma.approvalRequest.count({
            where: {
                is_completed: false,
                OR: [
                    { requested_by: userId },
                    { project_id: { in: projectIds } }
                ]
            }
        }),
        // Progress reports for assigned projects
        prisma.projectProgress.count({
            where: { project_id: { in: projectIds } }
        })
    ]);

    // 3. Simple Alert Count (Expiries in next 30 days for personnel/equipment on these projects)
    const windowDate = new Date();
    windowDate.setDate(windowDate.getDate() + 30);

    const alertCount = await prisma.employee.count({
        where: {
            project_id: { in: projectIds },
            OR: [
                { iqama_expiry: { lte: windowDate } },
                { passport_expiry: { lte: windowDate } }
            ]
        }
    });

    // Summary valuation
    const isSharedRole = !user.projectScopeActive;
    let inventoryValuation = 0;
    
    if (user.companyId || user.isSuperAdmin) {
        const invWhere = {};
        if (!user.isSuperAdmin) invWhere.company_id = user.companyId;
        const inventory = await prisma.inventoryStock.findMany({
            where: invWhere,
            include: { item: { select: { standard_price: true } } }
        });
        inventoryValuation = inventory.reduce((sum, stock) => sum + (Number(stock.quantity) * Number(stock.item?.standard_price || 0)), 0);
    }

    return {
        activeSites: projectIds.length,
        pendingApprovals,
        progressItems: progressCount,
        alertCount,
        inventoryValuation
    };
}

module.exports = { 
    getSuperadminDashboard, 
    getDeptHeadDashboard, 
    getCompanyHeadDashboard,
    getProjectDashboard,
    getComplianceDashboard,
    getWorkspaceSummary
};
