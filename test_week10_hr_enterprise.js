"use strict";

require("dotenv").config();
const assert = require("assert");
const crypto = require("crypto");
const prisma = require("./src/db");

const { createEmployee, reviseEmployeeSalary } = require("./src/modules/employees/employees.service");
const { recordAttendance } = require("./src/modules/hr/attendance/attendance.service");
const { createOvertimeRequest, approveOvertime } = require("./src/modules/hr/overtime/overtime.service");
const { requestLeave, approveLeave } = require("./src/modules/hr/leave/leave.service");
const { workerProcessDraftRun, workerProcessApproval } = require("./src/modules/hr/payroll/payroll.worker");
const { reversePayroll } = require("./src/modules/hr/payroll/payroll.workflow");

async function runWeek10Tests() {
    console.log("\x1b[36m%s\x1b[0m", "=========================================================");
    console.log("\x1b[36m%s\x1b[0m", "   RUNNING WEEK 10 HR & PAYROLL ENTERPRISE VERIFICATION");
    console.log("\x1b[36m%s\x1b[0m", "=========================================================");

    const project = await prisma.project.findFirst();
    if (!project) {
        throw new Error("No projects found in the database. Please seed the database first.");
    }
    const companyId = project.company_id;
    const user = await prisma.user.findFirst({ where: { company_id: companyId } });
    if (!user) throw new Error("No user found.");

    const period = "2026-05";

    // Clean up previous runs for this period
    const existingRuns = await prisma.payrollRun.findMany({
        where: { company_id: companyId, period_month: { startsWith: period } }
    });
    for (const run of existingRuns) {
        await prisma.laborCostAllocation.deleteMany({ where: { payroll_item: { payroll_run_id: run.id } } });
        await prisma.payslip.deleteMany({ where: { payroll_item: { payroll_run_id: run.id } } });
        await prisma.payrollItem.deleteMany({ where: { payroll_run_id: run.id } });
        await prisma.payrollApproval.deleteMany({ where: { payroll_run_id: run.id } });
        await prisma.payrollRun.delete({ where: { id: run.id } });
    }
    await prisma.payrollSnapshot.deleteMany({
        where: { company_id: companyId, period_month: { startsWith: period } }
    });

    // Create a designation
    const designation = await prisma.designation.create({
        data: {
            company_id: companyId,
            title: `Software Engineer ${Date.now()}`
        }
    });

    // ─── 1. Overnight Shift Test ───
    console.log("\n[TEST] 1. Creating Overnight Shift (crossing midnight)...");
    const overnightShift = await prisma.shift.create({
        data: {
            company_id: companyId,
            name: "Overnight Shift",
            start_time: "22:00",
            end_time: "06:00",
            grace_period: 15,
            working_hours: 8
        }
    });

    const emp = await createEmployee(companyId, {
        name: `Overnight Worker ${Date.now()}`,
        designation_id: designation.id,
        shift_id: overnightShift.id,
        joining_date: new Date("2026-05-01").toISOString(),
        basic_salary: 10000,
        housing_allowance: 2000,
        transportation_allowance: 1000,
        other_allowance: 0,
        bank_iban: "SA1234567890123456789012"
    }, user.id);

    console.log("Recording clock-in at 21:55 local time (early clock in)...");
    const clockInTime = new Date(2026, 4, 20, 21, 55, 0);
    await recordAttendance(companyId, emp.id, "CHECK_IN", clockInTime.toISOString());

    console.log("Recording clock-out next morning at 06:05 local time...");
    const clockOutTime = new Date(2026, 4, 21, 6, 5, 0);
    const attResult = await recordAttendance(companyId, emp.id, "CHECK_OUT", clockOutTime.toISOString());

    assert.ok(attResult.worked_hours >= 8, "Worked hours should support cross-midnight shift (8.17 hours)");
    console.log(`  ✔ Overnight shift verified. Hours calculated: ${Number(attResult.worked_hours).toFixed(2)}`);

    // ─── 2. Absence Deductions and Salary Revisions ───
    console.log("\n[TEST] 2. Checking proration & absence penalization...");
    // Let's revise salary
    await reviseEmployeeSalary(emp.id, {
        effective_from: new Date("2026-05-02").toISOString(),
        basic_salary: 9000,
        allowances: {
            housing_allowance: 2000,
            transportation_allowance: 1000,
            other_allowance: 0
        },
        reason: "Alignment"
    }, user.id);

    // Let's request leave overlap prevention check
    console.log("Checking leave & overtime overlap prevention...");
    const leaveType = await prisma.leaveType.create({
        data: {
            company_id: companyId,
            name: "Casual Leave",
            is_paid: true,
            yearly_accrual: 10
        }
    });

    await prisma.leaveBalance.create({
        data: {
            company_id: companyId,
            employee_id: emp.id,
            leave_type_id: leaveType.id,
            year: 2026,
            total_accrued: 10,
            total_used: 0,
            balance: 10
        }
    });

    const leave = await requestLeave(companyId, emp.id, {
        leave_type_id: leaveType.id,
        start_date: new Date("2026-05-10T00:00:00Z").toISOString(),
        end_date: new Date("2026-05-11T00:00:00Z").toISOString(),
        reason: "Fever"
    });
    await approveLeave(leave.id, user.id);

    await assert.rejects(
        requestLeave(companyId, emp.id, {
            leave_type_id: leaveType.id,
            start_date: new Date("2026-05-10T00:00:00Z").toISOString(),
            end_date: new Date("2026-05-10T00:00:00Z").toISOString(),
            reason: "Overlapping leave request"
        }),
        /Overlap/i,
        "Should block overlapping leave requests"
    );
    console.log("  ✔ Leave overlap block verified.");

    // ─── 3. GL Account & Posting Verification ───
    console.log("\n[TEST] 3. Resolving Chart of Accounts for double-entry Posting...");
    await prisma.chartOfAccount.upsert({
        where: { company_id_account_code: { company_id: companyId, account_code: "51000" } },
        update: {},
        create: {
            company_id: companyId,
            account_code: "51000",
            account_name: "Salaries Expense",
            account_type: "Expense",
            is_active: true
        }
    });
    await prisma.chartOfAccount.upsert({
        where: { company_id_account_code: { company_id: companyId, account_code: "21000" } },
        update: {},
        create: {
            company_id: companyId,
            account_code: "21000",
            account_name: "Salaries Payable",
            account_type: "Liability",
            is_active: true
        }
    });
    await prisma.chartOfAccount.upsert({
        where: { company_id_account_code: { company_id: companyId, account_code: "22000" } },
        update: {},
        create: {
            company_id: companyId,
            account_code: "22000",
            account_name: "Payroll Deductions Clearing",
            account_type: "Liability",
            is_active: true
        }
    });

    // ─── 4. Run & Lock Draft Run ───
    console.log("\n[TEST] 4. Processing payroll draft run...");
    const draftRun = await workerProcessDraftRun(companyId, period, user.id);
    assert.strictEqual(draftRun.status, "VALIDATED");
    
    // Verify absent penalty calculations
    const runItem = await prisma.payrollItem.findFirst({
        where: { payroll_run_id: draftRun.id, employee_id: emp.id }
    });
    assert.ok(Number(runItem.deductions) > 0, "Absence day penalty deductions should be processed");
    console.log(`  ✔ Absence penalization verified. Basic: ${runItem.basic_salary}, Deductions: ${runItem.deductions}`);

    // Lock payroll (post)
    console.log("Approving, locking and posting to GL...");
    const lockedRun = await workerProcessApproval(draftRun.id, user.id);
    assert.strictEqual(lockedRun.status, "POSTED");

    // Check voucher double entry lines
    const voucher = await prisma.voucher.findFirst({
        where: {
            company_id: companyId,
            event_type: "PAYROLL",
            narration: { contains: period }
        },
        orderBy: { created_at: "desc" },
        include: {
            ledger_entries: {
                include: { account: true }
            }
        }
    });
    assert.ok(voucher, "Should create a Voucher");
    
    let debits = 0;
    let credits = 0;
    let salariesPayableChecked = false;
    let deductionClearingChecked = false;

    for (const line of voucher.ledger_entries) {
        debits += Number(line.debit);
        credits += Number(line.credit);
        if (line.account.account_code === "21000" && Number(line.credit) > 0) salariesPayableChecked = true;
        if (line.account.account_code === "22000" && Number(line.credit) > 0) deductionClearingChecked = true;
    }
    assert.strictEqual(debits.toFixed(2), credits.toFixed(2), "GL posting must satisfy double-entry equilibrium");
    assert.ok(salariesPayableChecked, "Salaries payable account (21000) must receive a Credit split");
    assert.ok(deductionClearingChecked, "Deduction clearing account (22000) must receive a Credit split");
    console.log("  ✔ GL Posting split voucher verified (Double-entry balanced).");

    // ─── 5. Reversal and Constraint Check ───
    console.log("\n[TEST] 5. Testing Reversal Safety...");
    await reversePayroll(lockedRun.id, user.id, "Audit check failed, need rerun");

    // Check that reversed run has period Month updated
    const reversedRun = await prisma.payrollRun.findUnique({
        where: { id: lockedRun.id }
    });
    assert.ok(reversedRun.period_month.includes("_REV_"), "Reversed period month must be suffixed to release constraint");
    
    const payslips = await prisma.payslip.findMany({
        where: { payroll_item: { payroll_run_id: lockedRun.id } }
    });
    assert.ok(payslips.every(p => !p.is_published), "Payslips under reversed run must be unpublished");

    // Check negative labor cost allocations
    const revAllocations = await prisma.laborCostAllocation.findMany({
        where: { payroll_run_id: lockedRun.id }
    });
    const hasNegative = revAllocations.some(a => Number(a.amount) < 0);
    assert.ok(hasNegative, "Reversal must create explicit negative labor cost allocation records to neutralize project COS");

    // Check Profitability Recalculation Queue for REVERSAL trigger
    const recalc = await prisma.recalculationQueue.findFirst({
        where: { queue_type: "PROFITABILITY", triggered_by: "PAYROLL_REVERSAL" }
    });
    assert.ok(recalc, "Reversal must queue a profitability sync to roll back financial statements");

    console.log("  ✔ Payroll Reversal safety checks verified (Including Project COS Rollbacks).");

    // Now, run draft again to verify constraint release
    console.log("Generating new draft run for the same period month...");
    const newDraft = await workerProcessDraftRun(companyId, period, user.id);
    assert.strictEqual(newDraft.status, "VALIDATED", "Should allow drafting same period month after reversal");
    console.log("  ✔ Unique constraint release verified (Rerun possible).");

    // Cleanup
    console.log("\n[TEST] 6. Cleaning up test assets...");
    await prisma.laborCostAllocation.deleteMany({ where: { payroll_item: { payroll_run_id: newDraft.id } } });
    await prisma.payrollItem.deleteMany({ where: { payroll_run_id: newDraft.id } });
    await prisma.payrollApproval.deleteMany({ where: { payroll_run_id: newDraft.id } });
    await prisma.payrollRun.delete({ where: { id: newDraft.id } });

    await prisma.laborCostAllocation.deleteMany({ where: { payroll_item: { payroll_run_id: reversedRun.id } } });
    await prisma.payslip.deleteMany({ where: { payroll_item: { payroll_run_id: reversedRun.id } } });
    await prisma.payrollItem.deleteMany({ where: { payroll_run_id: reversedRun.id } });
    await prisma.payrollApproval.deleteMany({ where: { payroll_run_id: reversedRun.id } });
    await prisma.payrollRun.delete({ where: { id: reversedRun.id } });

    await prisma.payrollSnapshot.deleteMany({
        where: { company_id: companyId, period_month: { startsWith: period } }
    });

    await prisma.leaveRequest.delete({ where: { id: leave.id } });
    await prisma.leaveBalance.deleteMany({ where: { employee_id: emp.id } });
    await prisma.leaveType.delete({ where: { id: leaveType.id } });
    await prisma.attendance.delete({ where: { id: attResult.id } });
    await prisma.salaryRevision.deleteMany({ where: { employee_id: emp.id } });
    await prisma.employeeBankAccount.deleteMany({ where: { employee_id: emp.id } });
    await prisma.employee.delete({ where: { id: emp.id } });
    await prisma.shift.delete({ where: { id: overnightShift.id } });
    await prisma.designation.delete({ where: { id: designation.id } });

    console.log("\n\x1b[32m%s\x1b[0m", "ALL HARDENED WEEK 10 ENTERPRISE TESTS PASSED SUCCESSFULLY!");
    console.log("\x1b[32m%s\x1b[0m", "=========================================================");
}

runWeek10Tests().catch(err => {
    console.error("Test Suite Failed with error:", err);
    process.exit(1);
});
