const fs = require('fs');

const schemaAdditions = `
// ==================================================
// WEEK 10: ENTERPRISE HR & PAYROLL MODULES
// ==================================================

model Designation {
  id          String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id  String     @db.Uuid
  title       String     @db.VarChar(200)
  description String?
  level       Int?       @default(1)
  is_active   Boolean    @default(true)
  created_at  DateTime   @default(now()) @db.Timestamp(6)
  updated_at  DateTime   @updatedAt @db.Timestamp(6)

  company     Company    @relation(fields: [company_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  employees   Employee[]

  @@map("designations")
  @@schema("auth")
}

model Shift {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id     String    @db.Uuid
  name           String    @db.VarChar(100)
  start_time     String    @db.VarChar(10) // "08:00"
  end_time       String    @db.VarChar(10) // "17:00"
  grace_period   Int       @default(15) // Minutes
  working_hours  Decimal   @db.Decimal(5, 2)
  is_active      Boolean   @default(true)
  created_at     DateTime  @default(now()) @db.Timestamp(6)

  company        Company   @relation(fields: [company_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  employees      Employee[]

  @@map("shifts")
  @@schema("auth")
}

model Attendance {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id     String    @db.Uuid
  employee_id    String    @db.Uuid
  date           DateTime  @db.Date
  check_in       DateTime? @db.Timestamp(6)
  check_out      DateTime? @db.Timestamp(6)
  status         String    @db.VarChar(50) // PRESENT, ABSENT, LATE, HALF_DAY, LEAVE
  late_minutes   Int       @default(0)
  early_minutes  Int       @default(0)
  worked_hours   Decimal   @default(0) @db.Decimal(5, 2)
  overtime_hours Decimal   @default(0) @db.Decimal(5, 2)
  is_manual      Boolean   @default(false)
  created_at     DateTime  @default(now()) @db.Timestamp(6)
  updated_at     DateTime  @updatedAt @db.Timestamp(6)

  company        Company   @relation(fields: [company_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  employee       Employee  @relation(fields: [employee_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([employee_id, date])
  @@map("attendances")
  @@schema("auth")
}

model AttendanceCorrection {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id     String    @db.Uuid
  employee_id    String    @db.Uuid
  date           DateTime  @db.Date
  reason         String
  requested_in   DateTime? @db.Timestamp(6)
  requested_out  DateTime? @db.Timestamp(6)
  status         String    @default("PENDING") @db.VarChar(50) // PENDING, APPROVED, REJECTED
  approved_by_id String?   @db.Uuid
  created_at     DateTime  @default(now()) @db.Timestamp(6)
  updated_at     DateTime  @updatedAt @db.Timestamp(6)

  employee       Employee  @relation(fields: [employee_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  approved_by    User?     @relation(fields: [approved_by_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@map("attendance_corrections")
  @@schema("auth")
}

model OvertimeRequest {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id     String    @db.Uuid
  employee_id    String    @db.Uuid
  date           DateTime  @db.Date
  hours          Decimal   @db.Decimal(5, 2)
  type           String    @db.VarChar(50) // REGULAR, WEEKEND, HOLIDAY
  multiplier     Decimal   @db.Decimal(4, 2) // 1.5, 2.0
  reason         String?
  status         String    @default("PENDING") @db.VarChar(50)
  approved_by_id String?   @db.Uuid
  created_at     DateTime  @default(now()) @db.Timestamp(6)

  employee       Employee  @relation(fields: [employee_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  approved_by    User?     @relation(fields: [approved_by_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@map("overtime_requests")
  @@schema("auth")
}

model LeaveType {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id     String    @db.Uuid
  name           String    @db.VarChar(100)
  is_paid        Boolean   @default(true)
  yearly_accrual Decimal   @db.Decimal(5, 2) // 21, 30
  carry_forward  Boolean   @default(false)
  created_at     DateTime  @default(now()) @db.Timestamp(6)

  company        Company   @relation(fields: [company_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  leave_requests LeaveRequest[]
  balances       LeaveBalance[]

  @@map("leave_types")
  @@schema("auth")
}

model LeaveBalance {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id     String    @db.Uuid
  employee_id    String    @db.Uuid
  leave_type_id  String    @db.Uuid
  year           Int
  total_accrued  Decimal   @db.Decimal(5, 2)
  total_used     Decimal   @default(0) @db.Decimal(5, 2)
  balance        Decimal   @db.Decimal(5, 2)
  updated_at     DateTime  @updatedAt @db.Timestamp(6)

  employee       Employee  @relation(fields: [employee_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  leave_type     LeaveType @relation(fields: [leave_type_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([employee_id, leave_type_id, year])
  @@map("leave_balances")
  @@schema("auth")
}

model LeaveRequest {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id     String    @db.Uuid
  employee_id    String    @db.Uuid
  leave_type_id  String    @db.Uuid
  start_date     DateTime  @db.Date
  end_date       DateTime  @db.Date
  days           Decimal   @db.Decimal(5, 2)
  reason         String?
  status         String    @default("PENDING") @db.VarChar(50)
  approved_by_id String?   @db.Uuid
  created_at     DateTime  @default(now()) @db.Timestamp(6)

  employee       Employee  @relation(fields: [employee_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  leave_type     LeaveType @relation(fields: [leave_type_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  approved_by    User?     @relation(fields: [approved_by_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@map("leave_requests")
  @@schema("auth")
}

model PayrollRun {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id     String    @db.Uuid
  period_month   String    @db.VarChar(7) // YYYY-MM
  status         String    @default("DRAFT") @db.VarChar(50) // DRAFT, VALIDATED, APPROVED, POSTED
  total_gross    Decimal   @default(0) @db.Decimal(15, 2)
  total_net      Decimal   @default(0) @db.Decimal(15, 2)
  total_deduction Decimal  @default(0) @db.Decimal(15, 2)
  processed_by   String?   @db.Uuid
  locked_at      DateTime? @db.Timestamp(6)
  created_at     DateTime  @default(now()) @db.Timestamp(6)
  updated_at     DateTime  @updatedAt @db.Timestamp(6)

  company        Company       @relation(fields: [company_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  creator        User?         @relation("PayrollRunCreator", fields: [processed_by], references: [id], onDelete: NoAction, onUpdate: NoAction)
  items          PayrollItem[]
  approvals      PayrollApproval[]

  @@unique([company_id, period_month])
  @@map("payroll_runs")
  @@schema("auth")
}

model PayrollItem {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  payroll_run_id     String    @db.Uuid
  employee_id        String    @db.Uuid
  basic_salary       Decimal   @db.Decimal(12, 2)
  allowances         Decimal   @db.Decimal(12, 2)
  overtime_pay       Decimal   @db.Decimal(12, 2)
  deductions         Decimal   @db.Decimal(12, 2)
  net_salary         Decimal   @db.Decimal(12, 2)
  breakdown          Json      // Detailed component breakdown
  is_posted          Boolean   @default(false)
  created_at         DateTime  @default(now()) @db.Timestamp(6)

  payroll_run        PayrollRun @relation(fields: [payroll_run_id], references: [id], onDelete: Cascade)
  employee           Employee   @relation(fields: [employee_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  allocations        LaborCostAllocation[]
  payslip            Payslip?

  @@unique([payroll_run_id, employee_id])
  @@map("payroll_items")
  @@schema("auth")
}

model PayrollApproval {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  payroll_run_id String    @db.Uuid
  approved_by_id String    @db.Uuid
  status         String    @db.VarChar(50) // APPROVED, REJECTED
  comments       String?
  created_at     DateTime  @default(now()) @db.Timestamp(6)

  payroll_run    PayrollRun @relation(fields: [payroll_run_id], references: [id], onDelete: Cascade)
  approver       User       @relation(fields: [approved_by_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@map("payroll_approvals")
  @@schema("auth")
}

model Payslip {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  payroll_item_id    String    @unique @db.Uuid
  employee_id        String    @db.Uuid
  pdf_url            String?
  integrity_hash     String?   @db.VarChar(255) // SHA-256 hash of payslip contents
  is_published       Boolean   @default(false)
  created_at         DateTime  @default(now()) @db.Timestamp(6)

  payroll_item       PayrollItem @relation(fields: [payroll_item_id], references: [id], onDelete: Cascade)
  employee           Employee    @relation(fields: [employee_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@map("payslips")
  @@schema("auth")
}

model SalaryRevision {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  employee_id        String    @db.Uuid
  effective_from     DateTime  @db.Date
  effective_to       DateTime? @db.Date
  basic_salary       Decimal   @db.Decimal(12, 2)
  allowances         Json?
  reason             String?
  approved_by_id     String?   @db.Uuid
  created_at         DateTime  @default(now()) @db.Timestamp(6)

  employee           Employee  @relation(fields: [employee_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  approved_by        User?     @relation(fields: [approved_by_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@map("salary_revisions")
  @@schema("auth")
}

model LaborCostAllocation {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  payroll_item_id    String    @db.Uuid
  project_id         String?   @db.Uuid
  department_id      String?   @db.Uuid
  amount             Decimal   @db.Decimal(12, 2)
  percentage         Decimal   @db.Decimal(5, 2)
  type               String    @db.VarChar(50) // DIRECT_LABOR, OVERHEAD
  created_at         DateTime  @default(now()) @db.Timestamp(6)

  payroll_item       PayrollItem @relation(fields: [payroll_item_id], references: [id], onDelete: Cascade)
  project            Project?    @relation(fields: [project_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  department         Department? @relation(fields: [department_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@map("labor_cost_allocations")
  @@schema("auth")
}

model PayrollAuditLog {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id         String    @db.Uuid
  action             String    @db.VarChar(100) // RUN_CREATED, POSTED, REVERSED
  user_id            String?   @db.Uuid
  details            Json
  created_at         DateTime  @default(now()) @db.Timestamp(6)

  company            Company   @relation(fields: [company_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  user               User?     @relation(fields: [user_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@map("payroll_audit_logs")
  @@schema("auth")
}

model PayrollSnapshot {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id         String    @db.Uuid
  period_month       String    @db.VarChar(7)
  snapshot_data      Json      // Immutable JSON dump of the entire payroll state
  hash               String    @db.VarChar(255)
  created_at         DateTime  @default(now()) @db.Timestamp(6)

  company            Company   @relation(fields: [company_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@map("payroll_snapshots")
  @@schema("auth")
}

model EmployeeBankAccount {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  employee_id        String    @unique @db.Uuid
  bank_name          String    @db.VarChar(200)
  account_name       String    @db.VarChar(200)
  iban               String    @db.VarChar(100)
  swift_code         String?   @db.VarChar(50)
  is_active          Boolean   @default(true)
  created_at         DateTime  @default(now()) @db.Timestamp(6)

  employee           Employee  @relation(fields: [employee_id], references: [id], onDelete: Cascade)

  @@map("employee_bank_accounts")
  @@schema("auth")
}

// Week 10 Additions for existing Company/User models
`;

let content = fs.readFileSync('prisma/schema.prisma', 'utf8');

// Also update Employee to add relations
content = content.replace(/model Employee \{[\s\S]*?@@schema\("auth"\)\n\}/g, (match) => {
    return match.replace(/@@map\("employees"\)/, 
`  designation_id String?   @db.Uuid
  shift_id       String?   @db.Uuid

  designationObj Designation? @relation(fields: [designation_id], references: [id], onDelete: SetNull)
  shift          Shift?       @relation(fields: [shift_id], references: [id], onDelete: SetNull)

  attendances           Attendance[]
  attendance_corrs      AttendanceCorrection[]
  overtime_requests     OvertimeRequest[]
  leave_balances        LeaveBalance[]
  leave_requests        LeaveRequest[]
  payroll_items         PayrollItem[]
  payslips              Payslip[]
  salary_revisions      SalaryRevision[]
  bank_account          EmployeeBankAccount?

  @@map("employees")`);
});

// Update Company model to add new relations
content = content.replace(/model Company \{[\s\S]*?@@schema\("auth"\)\n\}/g, (match) => {
    return match.replace(/@@map\("companies"\)/,
`  designations         Designation[]
  shifts               Shift[]
  attendances          Attendance[]
  leave_types          LeaveType[]
  payroll_runs         PayrollRun[]
  payroll_audit_logs   PayrollAuditLog[]
  payroll_snapshots    PayrollSnapshot[]

  @@map("companies")`);
});

// Update User model to add new relations
content = content.replace(/model User \{[\s\S]*?@@schema\("auth"\)\n\}/g, (match) => {
    return match.replace(/@@map\("users"\)/,
`  attendance_approvals   AttendanceCorrection[]
  overtime_approvals     OvertimeRequest[]
  leave_approvals        LeaveRequest[]
  payroll_run_creations  PayrollRun[] @relation("PayrollRunCreator")
  payroll_approvals      PayrollApproval[]
  salary_revisions       SalaryRevision[]
  payroll_audit_logs     PayrollAuditLog[]

  @@map("users")`);
});

// Update Department model
content = content.replace(/model Department \{[\s\S]*?@@schema\("auth"\)\n\}/g, (match) => {
    return match.replace(/@@map\("departments"\)/,
`  labor_cost_allocations LaborCostAllocation[]

  @@map("departments")`);
});

// Update Project model
content = content.replace(/model Project \{[\s\S]*?@@schema\("auth"\)\n\}/g, (match) => {
    return match.replace(/@@map\("projects"\)/,
`  labor_cost_allocations LaborCostAllocation[]

  @@map("projects")`);
});


fs.writeFileSync('prisma/schema.prisma', content + schemaAdditions);
console.log("Schema updated with Week 10 models!");
