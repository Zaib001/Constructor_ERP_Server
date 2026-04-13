const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'prisma/schema.prisma');
let code = fs.readFileSync(file, 'utf8');

function addRelation(modelName, relationCode) {
    const regex = new RegExp(`(model ${modelName} \\{[\\s\\S]*?)(@@map|@@schema|})`);
    if (regex.test(code)) {
        code = code.replace(regex, `$1  ${relationCode}\n\n  $2`);
    } else {
        const regexEnd = new RegExp(`(model ${modelName} \\{[\\s\\S]*?)(\\n\\})`);
        code = code.replace(regexEnd, `$1\n  ${relationCode}\n}`);
    }
}

// Add to Company
addRelation('Company', 'petrol_expenses PetrolExpense[]');
// Add to Project
addRelation('Project', 'petrol_expenses PetrolExpense[]');
// Add to User
addRelation('User', 'created_petrol_expenses PetrolExpense[] @relation("PetrolCreator")\n  verified_petrol_expenses PetrolExpense[] @relation("PetrolVerifier")');
// Add to Vehicle
addRelation('Vehicle', 'petrol_expenses PetrolExpense[]');

// Append new model
code += `

// ─── Petrol Expense Module ──────────────────────────────────────────────────

model PetrolExpense {
  id                        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id                String?   @db.Uuid
  bill_no                   String    @db.VarChar(100)
  job_type                  String    @db.VarChar(20) // "job", "admin"
  project_id                String?   @db.Uuid
  job_number                String?   @db.VarChar(100)
  vehicle_id                String    @db.Uuid
  vehicle_plate_no          String?   @db.VarChar(50)
  
  petrol_amount_excl_vat    Decimal   @db.Decimal
  vat_amount                Decimal   @db.Decimal
  total_amount              Decimal   @db.Decimal
  
  odometer_reading          Int
  last_odometer             Int?
  distance_since_last       Int?
  cost_per_km               Decimal?  @db.Decimal
  
  fuel_date                 DateTime  @db.Date
  created_by                String?   @db.Uuid
  verified_by_accounts      String?   @db.Uuid
  verification_status       String?   @default("pending") @db.VarChar(50) // "pending", "verified", "rejected"
  remarks                   String?
  attachment                String?
  
  created_at                DateTime? @default(now()) @db.Timestamp(6)
  updated_at                DateTime? @db.Timestamp(6)
  deleted_at                DateTime? @db.Timestamp(6)

  company  Company? @relation(fields: [company_id], references: [id], onDelete: Cascade)
  project  Project? @relation(fields: [project_id], references: [id])
  vehicle  Vehicle  @relation(fields: [vehicle_id], references: [id])
  creator  User?    @relation("PetrolCreator", fields: [created_by], references: [id])
  verifier User?    @relation("PetrolVerifier", fields: [verified_by_accounts], references: [id])

  @@unique([bill_no, company_id])
  @@index([vehicle_id, fuel_date])
  @@index([company_id, fuel_date])
  @@index([project_id])
  @@map("petrol_expenses")
  @@schema("auth")
}
`;

fs.writeFileSync(file, code);
console.log("updated schema for petrol expenses");
