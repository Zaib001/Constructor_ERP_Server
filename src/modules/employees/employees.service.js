const prisma = require("../../db");
const { applyDataScope, MODULES, ROLE_GROUPS } = require("../../utils/scoping");

async function getAllEmployees(user, projectId, departmentId, page = 1, pageSize = 50) {
    const { companyId, isSuperAdmin } = user;
    
    const skip = (page - 1) * pageSize;
    const where = applyDataScope(user, { 
        module: MODULES.HR, 
        isWrite: false, 
        projectFilter: true 
    });
    
    if (projectId) where.project_id = projectId;
    if (departmentId) where.department_id = departmentId;
    
    // Only return active employees
    where.is_active = true;
    
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
    const where = applyDataScope(user, { 
        module: MODULES.HR, 
        isWrite: false, 
        projectFilter: true 
    });
    where.id = id;

    return await prisma.employee.findFirst({
        where: { ...where, is_active: true },
        include: {
            project: { select: { name: true, code: true } },
            departments: { select: { name: true } }
        }
    });
}

async function createEmployee(data, user) {
    const { companyId, isSuperAdmin, roleCode } = user;
    const isGlobalManager = ROLE_GROUPS.GLOBAL_MANAGERS.includes(roleCode);
    const targetCompanyId = (isSuperAdmin || isGlobalManager) ? (data.company_id || companyId) : companyId;

    // 1. Validate Required Fields & Financials
    if (!data.name) throw new Error("Missing required fields: Employee name is mandatory.");
    
    // Validate all numeric fields
    const financials = [
        'salary', 'basic_salary', 'housing_allowance', 
        'transportation_allowance', 'other_allowance'
    ];
    financials.forEach(field => {
        if (data[field] < 0) throw new Error(`Financial Error: ${field.replace('_', ' ')} cannot be negative.`);
    });

    // 2. Tenant & Relation Validation
    if (data.project_id) {
        const project = await prisma.project.findFirst({ 
            where: { 
                ...applyDataScope(user, { 
                    module: MODULES.PROJECTS, 
                    isWrite: false, 
                    projectFilter: true, 
                    projectModel: true 
                }), 
                id: data.project_id 
            } 
        });
        if (!project) throw new Error("Invalid Relation: Assigned project not found or access denied.");
    }

    // 3. Unique Checks (Enforce only for ACTIVE employees to allow re-entry)
    if (data.iqama_no) {
        const existing = await prisma.employee.findFirst({ 
            where: { iqama_no: data.iqama_no, is_active: true } 
        });
        if (existing) {
            throw new Error(`Duplicate Entry: Iqama number '${data.iqama_no}' is already registered to '${existing.name}'.`);
        }
    }

    if (data.employee_code) {
        const existing = await prisma.employee.findFirst({ 
            where: { employee_code: data.employee_code, is_active: true } 
        });
        if (existing) throw new Error(`Duplicate Entry: Employee Code '${data.employee_code}' is already assigned to '${existing.name}'.`);
    }

    // 4. Date Logic
    if (data.iqama_expiry && new Date(data.iqama_expiry) < new Date()) {
        throw new Error("Compliance Error: Cannot register employee with an expired Iqama.");
    }

    return await prisma.employee.create({
        data: {
            name: data.name,
            employee_code: data.employee_code || null,
            blood_group: data.blood_group || null,
            department: data.department || null,
            designation: data.designation || null,
            nationality: data.nationality || null,
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
            
            // New HR & Finance fields
            joining_date: data.joining_date ? new Date(data.joining_date) : null,
            insurance_company_name: data.insurance_company_name || null,
            bank_name: data.bank_name || null,
            bank_account_name: data.bank_account_name || null,
            bank_iban: data.bank_iban || null,
            basic_salary: data.basic_salary ? parseFloat(data.basic_salary) : null,
            housing_allowance: data.housing_allowance ? parseFloat(data.housing_allowance) : null,
            transportation_allowance: data.transportation_allowance ? parseFloat(data.transportation_allowance) : null,
            other_allowance: data.other_allowance ? parseFloat(data.other_allowance) : null,

            project_id: data.project_id || null,
            company_id: targetCompanyId,
            department_id: data.department_id || null,
            is_active: true
        }
    });
}

async function updateEmployee(id, data, user) {
    const { roleCode } = user;
    const isGlobalManager = ROLE_GROUPS.GLOBAL_MANAGERS.includes(roleCode);
    
    const where = applyDataScope(user, { module: MODULES.HR, isWrite: true });
    where.id = id;

    // 1. Tenant Security (Already enforced by where)
    const employee = await prisma.employee.findFirst({ where });
    if (!employee) throw new Error("Employee not found or access denied.");

    if (data.salary < 0) throw new Error("Financial Error: Salary cannot be negative.");

    const targetCompanyId = (user.isSuperAdmin || isGlobalManager) ? (data.company_id || employee.company_id) : employee.company_id;

    return await prisma.employee.update({
        where: { id },
        data: {
            name: data.name,
            employee_code: data.employee_code,
            blood_group: data.blood_group,
            department: data.department,
            designation: data.designation,
            nationality: data.nationality,
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
            
            // New HR & Finance fields
            joining_date: data.joining_date ? new Date(data.joining_date) : undefined,
            insurance_company_name: data.insurance_company_name,
            bank_name: data.bank_name,
            bank_account_name: data.bank_account_name,
            bank_iban: data.bank_iban,
            basic_salary: data.basic_salary !== undefined ? parseFloat(data.basic_salary) : undefined,
            housing_allowance: data.housing_allowance !== undefined ? parseFloat(data.housing_allowance) : undefined,
            transportation_allowance: data.transportation_allowance !== undefined ? parseFloat(data.transportation_allowance) : undefined,
            other_allowance: data.other_allowance !== undefined ? parseFloat(data.other_allowance) : undefined,

            project_id: data.project_id,
            department_id: data.department_id,
            company_id: targetCompanyId,
            updated_at: new Date()
        }
    });
}

async function deleteEmployee(id, user) {
    const where = applyDataScope(user, { module: MODULES.HR, isWrite: true });
    where.id = id;

    const employee = await prisma.employee.findFirst({ where });
    if (!employee) throw new Error("Employee not found or access denied.");

    try {
        // 1. Attempt hard delete (complete removal)
        return await prisma.employee.delete({ where: { id } });
    } catch (err) {
        // 2. Fallback to soft delete if relations exist (e.g. timesheets, logs)
        // We 'release' the unique numbers so they can be re-used for new entries
        const suffix = `_DEL_${Date.now()}`;
        return await prisma.employee.update({
            where: { id },
            data: { 
                is_active: false,
                iqama_no: employee.iqama_no ? `${employee.iqama_no}${suffix}` : null,
                employee_code: employee.employee_code ? `${employee.employee_code}${suffix}` : null,
                passport_no: employee.passport_no ? `${employee.passport_no}${suffix}` : null,
                updated_at: new Date()
            }
        });
    }
}

module.exports = {
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee
};
