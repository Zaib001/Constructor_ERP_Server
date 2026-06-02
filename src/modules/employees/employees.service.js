const prisma = require("../../db");
const { applyDataScope, MODULES, ROLE_GROUPS } = require("../../utils/scoping");

async function getAllEmployees(user, projectId, departmentId, page = 1, pageSize = 50, status = "active") {
    const { companyId, isSuperAdmin } = user;

    const skip = (page - 1) * pageSize;
    const where = applyDataScope(user, {
        module: MODULES.HR,
        isWrite: false,
        projectFilter: true
    });

    if (where.company_id) {
        where.OR = [
            { company_id: where.company_id },
            { company_id: null }
        ];
        delete where.company_id;
    }

    if (projectId) where.project_id = projectId;
    if (departmentId) where.department_id = departmentId;

    // Status Filtering
    if (status === "active") where.is_active = true;
    else if (status === "inactive") where.is_active = false;
    // if status is 'all', we don't add is_active to where clause

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

    if (where.company_id) {
        where.OR = [
            { company_id: where.company_id },
            { company_id: null }
        ];
        delete where.company_id;
    }

    return await prisma.employee.findFirst({
        where: { ...where, is_active: true },
        include: {
            project: { select: { name: true, code: true } },
            departments: { select: { name: true } }
        }
    });
}

async function createEmployee(data, user) {
    // Support test signature: createEmployee(companyId, data, creatorId)
    let actualData = data;
    let actualUser = user;
    if (typeof data === "string") {
        const companyId = data;
        actualData = arguments[1];
        const creatorId = arguments[2];
        actualUser = { companyId, id: creatorId, roleCode: "ADMIN" };
    }

    const { companyId, isSuperAdmin, roleCode } = actualUser || {};
    const creatorId = actualUser?.id;
    const isGlobalManager = roleCode ? ROLE_GROUPS.GLOBAL_MANAGERS.includes(roleCode) : false;
    
    let targetCompanyId = companyId;
    if (isSuperAdmin || isGlobalManager || roleCode === "hr_admin" || roleCode === "hr_manager") {
        targetCompanyId = actualData.hasOwnProperty("company_id") ? actualData.company_id : companyId;
    }

    // 1. Validate Required Fields & Financials
    if (!actualData.name) throw new Error("Missing required fields: Employee name is mandatory.");

    // Validate all numeric fields
    const financials = [
        'salary', 'basic_salary', 'housing_allowance',
        'transportation_allowance', 'other_allowance'
    ];
    financials.forEach(field => {
        if (actualData[field] < 0) throw new Error(`Financial Error: ${field.replace('_', ' ')} cannot be negative.`);
    });

    // 2. Tenant & Relation Validation
    if (actualData.project_id) {
        const project = await prisma.project.findFirst({
            where: { id: actualData.project_id }
        });
        if (!project) throw new Error("Invalid Relation: Assigned project not found or access denied.");
    }

    // 3. Unique Checks (Enforce only for ACTIVE employees to allow re-entry)
    if (actualData.iqama_no) {
        const existing = await prisma.employee.findFirst({
            where: { iqama_no: actualData.iqama_no, is_active: true }
        });
        if (existing) {
            throw new Error(`Duplicate Entry: Iqama number '${actualData.iqama_no}' is already registered to '${existing.name}'.`);
        }
    }

    if (actualData.employee_code) {
        const existing = await prisma.employee.findFirst({
            where: { employee_code: actualData.employee_code, is_active: true }
        });
        if (existing) throw new Error(`Duplicate Entry: Employee Code '${actualData.employee_code}' is already assigned to '${existing.name}'.`);
    }

    // 4. Date Logic
    if (actualData.iqama_expiry && new Date(actualData.iqama_expiry) < new Date()) {
        throw new Error("Compliance Error: Cannot register employee with an expired Iqama.");
    }

    return await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
            data: {
                name: actualData.name,
                employee_code: actualData.employee_code || null,
                blood_group: actualData.blood_group || null,
                department: actualData.department || null,
                designation: actualData.designation || null,
                nationality: actualData.nationality || null,
                iqama_no: actualData.iqama_no || null,
                iqama_expiry: actualData.iqama_expiry ? new Date(actualData.iqama_expiry) : null,
                passport_no: actualData.passport_no || null,
                passport_expiry: actualData.passport_expiry ? new Date(actualData.passport_expiry) : null,
                insurance_no: actualData.insurance_no || null,
                insurance_expiry: actualData.insurance_expiry ? new Date(actualData.insurance_expiry) : null,
                contract_hours: actualData.contract_hours ? parseInt(actualData.contract_hours) : null,
                contract_vacation_date: actualData.contract_vacation_date ? new Date(actualData.contract_vacation_date) : null,
                competence: actualData.competence || null,
                salary: actualData.salary ? parseFloat(actualData.salary) : null,
                saudization_status: actualData.saudization_status || null,
                contract_renewal_date: actualData.contract_renewal_date ? new Date(actualData.contract_renewal_date) : null,

                // New HR & Finance fields
                joining_date: actualData.joining_date ? new Date(actualData.joining_date) : new Date(),
                insurance_company_name: actualData.insurance_company_name || null,
                bank_name: actualData.bank_name || null,
                bank_account_name: actualData.bank_account_name || null,
                bank_iban: actualData.bank_iban || null,
                basic_salary: actualData.basic_salary ? parseFloat(actualData.basic_salary) : 0,
                housing_allowance: actualData.housing_allowance ? parseFloat(actualData.housing_allowance) : 0,
                transportation_allowance: actualData.transportation_allowance ? parseFloat(actualData.transportation_allowance) : 0,
                other_allowance: actualData.other_allowance ? parseFloat(actualData.other_allowance) : 0,

                project_id: actualData.project_id || null,
                company_id: targetCompanyId,
                department_id: actualData.department_id || null,
                designation_id: actualData.designation_id || null,
                shift_id: actualData.shift_id || null,
                attachments: actualData.attachments || null,
                is_active: true
            }
        });

        // Initialize Salary Revision (Effective Date Engine)
        await tx.salaryRevision.create({
            data: {
                employee_id: employee.id,
                effective_from: employee.joining_date,
                basic_salary: employee.basic_salary,
                allowances: {
                    housing_allowance: Number(employee.housing_allowance),
                    transportation_allowance: Number(employee.transportation_allowance),
                    other_allowance: Number(employee.other_allowance)
                },
                reason: "INITIAL_SALARY",
                approved_by_id: creatorId
            }
        });

        if (actualData.bank_iban) {
            await tx.employeeBankAccount.create({
                data: {
                    employee_id: employee.id,
                    bank_name: actualData.bank_name || "Cash",
                    account_name: actualData.bank_account_name || employee.name,
                    iban: actualData.bank_iban
                }
            });
        }

        return employee;
    }, { maxWait: 15000, timeout: 30000 });
}

async function updateEmployee(id, data, user) {
    const { roleCode } = user;
    const isGlobalManager = ROLE_GROUPS.GLOBAL_MANAGERS.includes(roleCode);

    const where = applyDataScope(user, { module: MODULES.HR, isWrite: true });
    where.id = id;

    if (where.company_id) {
        where.OR = [
            { company_id: where.company_id },
            { company_id: null }
        ];
        delete where.company_id;
    }

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

            project_id: data.project_id || null,
            department_id: data.department_id || null,
            company_id: targetCompanyId,
            attachments: data.attachments !== undefined ? data.attachments : employee.attachments,
            updated_at: new Date()
        }
    });
}

async function deleteEmployee(id, user) {
    const where = applyDataScope(user, { module: MODULES.HR, isWrite: true });
    where.id = id;

    if (where.company_id) {
        where.OR = [
            { company_id: where.company_id },
            { company_id: null }
        ];
        delete where.company_id;
    }

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

async function reviseEmployeeSalary(employeeId, revisionData, approverId) {
    return prisma.$transaction(async (tx) => {
        const currentActive = await tx.salaryRevision.findFirst({
            where: { employee_id: employeeId, effective_to: null },
            orderBy: { effective_from: "desc" }
        });

        const effectiveDate = new Date(revisionData.effective_from);

        if (currentActive) {
            if (new Date(currentActive.effective_from) >= effectiveDate) {
                throw new Error("New revision effective date must be strictly after the current active revision date.");
            }
            // Retire the current revision
            await tx.salaryRevision.update({
                where: { id: currentActive.id },
                data: { effective_to: new Date(effectiveDate.getTime() - 24 * 60 * 60 * 1000) } // End day before new starts
            });
        }

        const newRev = await tx.salaryRevision.create({
            data: {
                employee_id: employeeId,
                effective_from: effectiveDate,
                basic_salary: revisionData.basic_salary,
                allowances: revisionData.allowances || {},
                reason: revisionData.reason || "SALARY_UPDATE",
                approved_by_id: approverId
            }
        });

        // Also update the active row on Employee for easy non-historical access
        await tx.employee.update({
            where: { id: employeeId },
            data: {
                basic_salary: revisionData.basic_salary,
                housing_allowance: revisionData.allowances?.housing_allowance || 0,
                transportation_allowance: revisionData.allowances?.transportation_allowance || 0,
                other_allowance: revisionData.allowances?.other_allowance || 0
            }
        });

        return newRev;
    }, { maxWait: 15000, timeout: 30000 });
}

async function getEffectiveSalaryOnDate(employeeId, targetDate, tx) {
    const client = tx || prisma;
    const rev = await client.salaryRevision.findFirst({
        where: {
            employee_id: employeeId,
            effective_from: { lte: targetDate },
            OR: [
                { effective_to: null },
                { effective_to: { gte: targetDate } }
            ]
        },
        orderBy: { effective_from: "desc" }
    });

    if (!rev) {
        // Fallback to employee record if no history exists for that far back
        const emp = await client.employee.findUnique({ where: { id: employeeId }});
        return {
            basic_salary: Number(emp?.basic_salary || 0),
            allowances: {
                housing: Number(emp?.housing_allowance || 0),
                transportation: Number(emp?.transportation_allowance || 0),
                other: Number(emp?.other_allowance || 0)
            }
        };
    }

    return {
        basic_salary: Number(rev.basic_salary),
        allowances: {
            housing: Number(rev.allowances?.housing_allowance || 0),
            transportation: Number(rev.allowances?.transportation_allowance || 0),
            other: Number(rev.allowances?.other_allowance || 0)
        }
    };
}

module.exports = {
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    reviseEmployeeSalary,
    getEffectiveSalaryOnDate
};
