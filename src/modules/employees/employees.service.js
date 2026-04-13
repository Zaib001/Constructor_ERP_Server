const prisma = require("../../db");
const { applyDataScope } = require("../../utils/scoping");

async function getAllEmployees(user, projectId, departmentId, page = 1, pageSize = 50) {
    const { companyId, isSuperAdmin } = user;
    
    const skip = (page - 1) * pageSize;
    const where = applyDataScope(user, { projectFilter: true });
    
    if (projectId) where.project_id = projectId;
    if (departmentId) where.department_id = departmentId;
    
    const [data, total] = await Promise.all([
        prisma.employee.findMany({
            where,
            skip,
            take: pageSize,
            include: {
                project: { select: { name: true, code: true } },
                departments: { select: { name: true } }
            },
            orderBy: { name: "asc" }
        }),
        prisma.employee.count({ where })
    ]);

    return { data, total, page, pageSize };
}

async function getEmployeeById(id, user) {
    const where = applyDataScope(user, { projectFilter: true });
    where.id = id;

    return await prisma.employee.findFirst({
        where,
        include: {
            project: { select: { name: true, code: true } },
            departments: { select: { name: true } }
        }
    });
}

async function createEmployee(data, user) {
    const { companyId, isSuperAdmin } = user;
    const targetCompanyId = isSuperAdmin ? (data.company_id || companyId) : companyId;

    // 1. Validate Required Fields & Financials
    if (!data.name) throw new Error("Missing required fields: Employee name is mandatory.");
    if (data.salary < 0) throw new Error("Financial Error: Salary cannot be negative.");

    // 2. Tenant & Relation Validation
    if (data.project_id) {
        const project = await prisma.project.findFirst({ 
            where: { ...applyDataScope(user, { projectFilter: true, projectModel: true }), id: data.project_id } 
        });
        if (!project) throw new Error("Invalid Relation: Assigned project not found or access denied.");
    }

    // 3. Unique Checks (Including soft-deleted to prevent collisions)
    if (data.iqama_no) {
        const existing = await prisma.employee.findFirst({ where: { iqama_no: data.iqama_no } });
        if (existing) {
            if (existing.deleted_at) throw new Error(`Archived Entry: Iqama '${data.iqama_no}' exists in trash. Restore it or use a different number.`);
            throw new Error(`Duplicate Entry: Iqama number '${data.iqama_no}' is already registered to '${existing.name}'.`);
        }
    }

    // 4. Date Logic
    if (data.iqama_expiry && new Date(data.iqama_expiry) < new Date()) {
        throw new Error("Compliance Error: Cannot register employee with an expired Iqama.");
    }

    return await prisma.employee.create({
        data: {
            name: data.name,
            department: data.department || null,
            designation: data.designation || null,
            iqama_no: data.iqama_no || null,
            iqama_expiry: data.iqama_expiry ? new Date(data.iqama_expiry) : null,
            passport_no: data.passport_no || null,
            passport_expiry: data.passport_expiry ? new Date(data.passport_expiry) : null,
            insurance_no: data.insurance_no || null,
            insurance_expiry: data.insurance_expiry ? new Date(data.insurance_expiry) : null,
            contract_hours: data.contract_hours ? parseInt(data.contract_hours) : null,
            contract_vacation_date: data.contract_vacation_date ? new Date(data.contract_vacation_date) : null,
            competence: data.competence || null,
            salary: data.salary ? parseFloat(data.salary) : null,
            saudization_status: data.saudization_status || null,
            contract_renewal_date: data.contract_renewal_date ? new Date(data.contract_renewal_date) : null,
            project_id: data.project_id || null,
            company_id: targetCompanyId,
            department_id: data.department_id || null
        }
    });
}

async function updateEmployee(id, data, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id, deleted_at: null };
    if (!isSuperAdmin) where.company_id = companyId;

    // 1. Tenant Security
    const employee = await prisma.employee.findFirst({ where });
    if (!employee) throw new Error("Employee not found or access denied.");

    if (data.salary < 0) throw new Error("Financial Error: Salary cannot be negative.");

    return await prisma.employee.update({
        where: { id },
        data: {
            name: data.name,
            department: data.department,
            designation: data.designation,
            iqama_no: data.iqama_no,
            iqama_expiry: data.iqama_expiry ? new Date(data.iqama_expiry) : null,
            passport_no: data.passport_no,
            passport_expiry: data.passport_expiry ? new Date(data.passport_expiry) : null,
            insurance_no: data.insurance_no,
            insurance_expiry: data.insurance_expiry ? new Date(data.insurance_expiry) : null,
            contract_hours: data.contract_hours ? parseInt(data.contract_hours) : null,
            contract_vacation_date: data.contract_vacation_date ? new Date(data.contract_vacation_date) : null,
            competence: data.competence,
            salary: data.salary ? parseFloat(data.salary) : null,
            saudization_status: data.saudization_status,
            contract_renewal_date: data.contract_renewal_date ? new Date(data.contract_renewal_date) : null,
            project_id: data.project_id,
            department_id: data.department_id,
            updated_at: new Date()
        }
    });
}

async function deleteEmployee(id, user) {
    const { companyId, isSuperAdmin } = user;
    const where = { id, deleted_at: null };
    if (!isSuperAdmin) where.company_id = companyId;

    const employee = await prisma.employee.findFirst({ where });
    if (!employee) throw new Error("Employee not found or access denied.");

    return await prisma.employee.update({
        where: { id },
        data: { 
            deleted_at: new Date()
        }
    });
}

module.exports = {
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee
};
