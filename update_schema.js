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
addRelation('Company', 'purchase_requisitions PurchaseRequisition[]\n  petty_cash_requests PettyCashRequest[]');
// Add to Project
addRelation('Project', 'purchase_requisitions PurchaseRequisition[]\n  petty_cash_requests PettyCashRequest[]');
// Add to WBS
addRelation('WBS', 'purchase_requisitions PurchaseRequisition[]\n  petty_cash_requests PettyCashRequest[]');
// Add to User
addRelation('User', 'requested_prs PurchaseRequisition[] @relation("PRRequester")\n  approved_prs PRApproval[] @relation("PRApprover")\n  created_rfqs RFQ[] @relation("RFQCreator")\n  compared_rfqs ComparisonEngine[] @relation("RFQComparator")\n  requested_petty_cash PettyCashRequest[] @relation("PettyCashRequester")\n  approved_petty_cash PettyCashRequest[] @relation("PettyCashApprover")\n  verified_petty_cash PettyCashExpense[] @relation("PettyCashVerifier")');
// Add to Item
addRelation('Item', 'purchase_requisition_items PurchaseRequisitionItem[]\n  vendor_quote_items VendorQuoteItem[]\n  purchase_order_mapping PurchaseOrderItem[]');
// Add to Vendor
addRelation('Vendor', 'rfq_vendors RFQVendor[]\n  vendor_quotes VendorQuote[]\n  comparison_selections ComparisonEngine[]');

// Modify PurchaseOrder
code = code.replace(
    /model PurchaseOrder \{[\s\S]*?\n\}/,
    (match) => {
        let newMatch = match.replace('items    PurchaseOrderItem[]', 'items    PurchaseOrderItem[]\n  requisition_id String?   @db.Uuid\n  rfq_id String?   @db.Uuid\n  quote_id String?   @db.Uuid\n  delivery_terms String?\n  payment_terms String?\n  subtotal Decimal? @db.Decimal\n  vat_amount Decimal? @db.Decimal\n  total_amount Decimal? @db.Decimal\n  requisition PurchaseRequisition? @relation(fields: [requisition_id], references: [id])\n  rfq RFQ? @relation(fields: [rfq_id], references: [id])\n  quote VendorQuote? @relation(fields: [quote_id], references: [id])');
        return newMatch;
    }
);

// Modify PurchaseOrderItem
code = code.replace(
    /model PurchaseOrderItem \{[\s\S]*?\n\}/,
    (match) => {
        return match.replace('cost_code      CostCode?     @relation(fields: [cost_code_id], references: [id], onDelete: NoAction, onUpdate: NoAction)', 'cost_code      CostCode?     @relation(fields: [cost_code_id], references: [id], onDelete: NoAction, onUpdate: NoAction)\n  item_id String? @db.Uuid\n  item Item? @relation(fields: [item_id], references: [id])');
    }
);

// Append new models
code += `

// ─── Procurement Engine & Petty Cash (Week 4) ──────────────────────────────

model PurchaseRequisition {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pr_no        String    @unique @db.VarChar(100)
  company_id   String?   @db.Uuid
  project_id   String?   @db.Uuid
  wbs_id       String?   @db.Uuid
  requested_by String?   @db.Uuid
  reason       String?
  status       String?   @default("draft") @db.VarChar(50)
  request_date DateTime? @default(now()) @db.Timestamp(6)
  created_at   DateTime? @default(now()) @db.Timestamp(6)
  updated_at   DateTime? @db.Timestamp(6)
  deleted_at   DateTime? @db.Timestamp(6)

  company    Company?    @relation(fields: [company_id], references: [id])
  project    Project?    @relation(fields: [project_id], references: [id])
  wbs        WBS?        @relation(fields: [wbs_id], references: [id])
  requester  User?       @relation("PRRequester", fields: [requested_by], references: [id])

  items      PurchaseRequisitionItem[]
  approvals  PRApproval[]
  rfqs       RFQ[]
  purchase_orders PurchaseOrder[]

  @@map("purchase_requisitions")
  @@schema("auth")
}

model PurchaseRequisitionItem {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  requisition_id String    @db.Uuid
  item_id        String?   @db.Uuid
  quantity       Decimal   @db.Decimal
  required_date  DateTime? @db.Date
  remarks        String?

  requisition PurchaseRequisition @relation(fields: [requisition_id], references: [id], onDelete: Cascade)
  item        Item?               @relation(fields: [item_id], references: [id])

  @@map("purchase_requisition_items")
  @@schema("auth")
}

model PRApproval {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  requisition_id String    @db.Uuid
  approver_id    String?   @db.Uuid
  level          Int?
  decision       String?   @db.VarChar(50)
  reason         String?
  decided_at     DateTime? @default(now()) @db.Timestamp(6)

  requisition PurchaseRequisition @relation(fields: [requisition_id], references: [id], onDelete: Cascade)
  approver    User?               @relation("PRApprover", fields: [approver_id], references: [id])

  @@map("pr_approvals")
  @@schema("auth")
}

model RFQ {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  rfq_no         String    @unique @db.VarChar(100)
  requisition_id String?   @db.Uuid
  created_by     String?   @db.Uuid
  quote_deadline DateTime? @db.Timestamp(6)
  notes          String?
  status         String?   @default("draft") @db.VarChar(50)
  created_at     DateTime? @default(now()) @db.Timestamp(6)
  updated_at     DateTime? @db.Timestamp(6)
  deleted_at     DateTime? @db.Timestamp(6)

  requisition PurchaseRequisition? @relation(fields: [requisition_id], references: [id])
  creator     User?                @relation("RFQCreator", fields: [created_by], references: [id])

  vendors       RFQVendor[]
  quotes        VendorQuote[]
  comparisons   ComparisonEngine[]
  purchase_orders PurchaseOrder[]

  @@map("rfqs")
  @@schema("auth")
}

model RFQVendor {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  rfq_id          String    @db.Uuid
  vendor_id       String    @db.Uuid
  invited_at      DateTime? @default(now()) @db.Timestamp(6)
  response_status String?   @default("pending") @db.VarChar(50)

  rfq    RFQ    @relation(fields: [rfq_id], references: [id], onDelete: Cascade)
  vendor Vendor @relation(fields: [vendor_id], references: [id])

  @@map("rfq_vendors")
  @@schema("auth")
}

model VendorQuote {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  rfq_id        String    @db.Uuid
  vendor_id     String    @db.Uuid
  validity_date DateTime? @db.Date
  delivery_days Int?
  notes         String?
  attachment    String?
  status        String?   @default("submitted") @db.VarChar(50)
  created_at    DateTime? @default(now()) @db.Timestamp(6)

  rfq    RFQ    @relation(fields: [rfq_id], references: [id], onDelete: Cascade)
  vendor Vendor @relation(fields: [vendor_id], references: [id])

  items VendorQuoteItem[]
  purchase_orders PurchaseOrder[]

  @@map("vendor_quotes")
  @@schema("auth")
}

model VendorQuoteItem {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  quote_id    String    @db.Uuid
  item_id     String?   @db.Uuid
  unit_price  Decimal   @db.Decimal
  quantity    Decimal   @db.Decimal
  total_price Decimal   @db.Decimal

  quote VendorQuote @relation(fields: [quote_id], references: [id], onDelete: Cascade)
  item  Item?       @relation(fields: [item_id], references: [id])

  @@map("vendor_quote_items")
  @@schema("auth")
}

model ComparisonEngine {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  rfq_id              String    @db.Uuid
  selected_vendor_id  String?   @db.Uuid
  selection_reason    String?
  compared_by         String?   @db.Uuid
  comparison_snapshot Json?
  created_at          DateTime? @default(now()) @db.Timestamp(6)

  rfq             RFQ     @relation(fields: [rfq_id], references: [id], onDelete: Cascade)
  selected_vendor Vendor? @relation(fields: [selected_vendor_id], references: [id])
  comparator      User?   @relation("RFQComparator", fields: [compared_by], references: [id])

  @@map("comparison_engines")
  @@schema("auth")
}

model PettyCashRequest {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  request_no       String    @unique @db.VarChar(100)
  company_id       String?   @db.Uuid
  project_id       String?   @db.Uuid
  wbs_id           String?   @db.Uuid
  job_number       String?   @db.VarChar(100)
  description      String?
  estimated_cost   Decimal   @db.Decimal
  emergency_reason String?
  requested_by     String?   @db.Uuid
  approved_by      String?   @db.Uuid
  status           String?   @default("submitted") @db.VarChar(50)
  created_at       DateTime? @default(now()) @db.Timestamp(6)
  updated_at       DateTime? @db.Timestamp(6)
  deleted_at       DateTime? @db.Timestamp(6)

  company   Company? @relation(fields: [company_id], references: [id])
  project   Project? @relation(fields: [project_id], references: [id])
  wbs       WBS?     @relation(fields: [wbs_id], references: [id])
  requester User?    @relation("PettyCashRequester", fields: [requested_by], references: [id])
  approver  User?    @relation("PettyCashApprover", fields: [approved_by], references: [id])

  expenses PettyCashExpense[]

  @@map("petty_cash_requests")
  @@schema("auth")
}

model PettyCashExpense {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  request_id            String    @db.Uuid
  bill_number           String?   @db.VarChar(100)
  company_name          String?   @db.VarChar(200)
  vat_number            String?   @db.VarChar(100)
  excluding_vat_amount  Decimal   @db.Decimal
  vat_amount            Decimal   @db.Decimal
  total_amount          Decimal   @db.Decimal
  purchase_date         DateTime? @db.Date
  attachment            String?
  verified_by_accounts  String?   @db.Uuid
  verification_status   String?   @default("pending") @db.VarChar(50)
  created_at            DateTime? @default(now()) @db.Timestamp(6)

  request  PettyCashRequest @relation(fields: [request_id], references: [id], onDelete: Cascade)
  verifier User?            @relation("PettyCashVerifier", fields: [verified_by_accounts], references: [id])

  @@map("petty_cash_expenses")
  @@schema("auth")
}
`;

fs.writeFileSync(file, code);
console.log("updated schema");
