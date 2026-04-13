# Week 5 Frontend Implementation Plan: Inventory Management

## 1. FRONTEND ROUTE STRUCTURE

**New Route Paths for Inventory**
- `/portal/inventory/dashboard` - High-level metrics and quick actions
- `/portal/inventory` (Redirects to stock snapshot)
- `/portal/inventory/stock` - Real-time stock snapshot overview
- `/portal/inventory/ledger/:itemId` - Immutable transactional history for a specific item
- `/portal/inventory/grn` - Goods Receipt Notes list
- `/portal/inventory/grn/create` - Create new GRN (often accessed from PO Detail)
- `/portal/inventory/grn/:id` - Read-only detail view of a processed GRN
- `/portal/inventory/issue` - Material Issues list
- `/portal/inventory/issue/create` - Create new Material Issue
- `/portal/inventory/issue/:id` - Read-only detail view of a processed Issue
- `/portal/inventory/stores` - List of configured stores/warehouses

**Existing Route Paths Needing Changes**
- `/portal/procurement/purchase-orders/:id` - Needs new tabular sections to display delivery status and related GRNs.
- `/portal/projects/:id` - Needs material consumption/actual cost visualization updates.
- `/portal/wbs/:id` - Needs actual cost and material issuance visualization updates.
- `/portal/master-data/items/:id` - Needs a "Current Stock" summary tab.

---

## 2. SIDEBAR / PORTAL NAVIGATION UPDATES

**Sidebar Structure Additions**
Under a new primary category `Inventory` or `Warehouse`:
- 📦 **Inventory** (Requires `inventory.read`)
  - Dashboard
  - Live Stock
  - Stock Ledger (Hidden if not explicitly needed, usually accessed via item)
  - Goods Receipts (GRN)
  - Material Issues
  - Stores Config

**Role Visibility**
- `super_admin` / `erp_admin`: Sees all inventory menu items.
- `storekeeper`: Sees Dashboard, Live Stock, GRNs, Material Issues.
- `project_manager`: Sees Live Stock, Material Issues (to approve/track what hit the project).
- `site_engineer`: Sees Live Stock, Material Issues (to request/create issues).
- `procurement_officer`: Sees Live Stock, GRNs (to verify PO delivery).
- `finance/accounts`: Sees Live Stock, GRNs (for 3-way matching prep).

---

## 3. NEW SCREENS TO BUILD

### Inventory Overview / Dashboard
- **Route**: `/portal/inventory/dashboard`
- **Purpose**: Quick snapshot of warehouse health.
- **API**: `/api/dashboard/inventory` (or derived from stock lists).
- **Key UI Sections**: Widgets for low stock items, recently processed GRNs, recently issued materials.
- **Roles**: All roles with `inventory.read`.

### Stores List
- **Route**: `/portal/inventory/stores`
- **Purpose**: Manage physical/logical storage locations.
- **API**: `/api/stores`
- **Table Columns**: Store Name, Location, Status.
- **Actions**: View, Edit Status.
- **Roles**: Admins (read/write). Storekeeper (read-only).

### Stock Snapshot
- **Route**: `/portal/inventory/stock`
- **Purpose**: View current available quantities across items and stores.
- **API**: `GET /api/inventory/stock`
- **Filters/Search**: Item Name, Component ID, Store ID dropdown.
- **Table Columns**: Item Code, Item Name, Store, Available Qty, Unit.
- **Actions**: View Ledger (redirects to `/portal/inventory/ledger/:id`).
- **Roles**: All with `inventory.read`.

### Stock Ledger
- **Route**: `/portal/inventory/ledger/:itemId`
- **Purpose**: Audit trail of every IN/OUT movement for a specific item.
- **API**: `GET /api/inventory/ledger/:itemId`
- **Filters/Search**: Store ID, Move Type (`GRN_IN`, `ISSUE_OUT`), Date Range.
- **Table Columns**: Date, Move Type, Ref Doc (GRN/Issue #), Store, Qty (+IN / -OUT), Performed By.
- **Roles Access**: Admins, Storekeepers, Finance (requires `inventory.ledger.read`).

### GRN List
- **Route**: `/portal/inventory/grn`
- **Purpose**: Log of all items received against POs.
- **API**: `GET /api/inventory/grn`
- **Filters/Search**: GRN #, PO #, Store, Date Range.
- **Table Columns**: GRN No, PO No, Store, Received Date, Received By, Remarks.
- **Actions**: View Detail.
- **Roles Access**: Storekeeper, Procurement, PM, Admins, Finance.

### Create GRN
- **Route**: `/portal/inventory/grn/create` (With `?poId=xxx`)
- **Purpose**: Record physical receipt of goods against an approved PO.
- **API**: `POST /api/inventory/grn`
- **Key UI Sections**: Header (PO selection, Store selection, Vendor DN input), Line Items (derived from PO).
- **Table Columns (Form)**: Item, PO Qty, Prev Received, Remaining, **Qty Receiving Now** (input), Qty Rejected (input).
- **Actions**: Submit GRN.
- **Roles Access**: Storekeeper ONLY (requires `inventory.grn.create`).

### GRN Detail
- **Route**: `/portal/inventory/grn/:id`
- **Purpose**: Read-only view of a submitted GRN.
- **Roles Access**: Same as GRN List.

### Material Issue List
- **Route**: `/portal/inventory/issue`
- **Purpose**: Log of all items issued from warehouse to site/project.
- **API**: `GET /api/inventory/issue`
- **Filters/Search**: Issue #, Project, WBS, Store.
- **Table Columns**: Issue No, Project, Store, Issued Date, Issued By.
- **Actions**: View Detail.
- **Roles Access**: Storekeeper, Site Engineer, PM, Finance.

### Create Material Issue
- **Route**: `/portal/inventory/issue/create`
- **Purpose**: Deplete stock and attribute cost to a Project WBS.
- **API**: `POST /api/inventory/issue`
- **Key UI Sections**: Header (Project, WBS, Store selection). Line Items.
- **Table Columns (Form)**: Item Select, Cost Code Select, Available Stock, **Issue Qty** (input).
- **Actions**: Submit Issue.
- **Roles Access**: Storekeeper, Site Engineer (requires `inventory.issue.create`).

### Material Issue Detail
- **Route**: `/portal/inventory/issue/:id`
- **Purpose**: Read-only tracking of what was issued and to where.
- **Roles Access**: Same as Issue List.

---

## 4. EXISTING SCREENS TO UPDATE

### Purchase Order Detail (`/portal/procurement/purchase-orders/:id`)
- **New Fields/Badges**: `delivery_status` badge (`pending`, `partial`, `complete`).
- **New Sections**: Output a "Related GRNs" table tab.
- **New Actions**: `[Receive Goods]` button enabled ONLY if PO is `approved`, `delivery_status != complete`, and User has `inventory.grn.create` role. This button links to `/portal/inventory/grn/create?poId=XY`.
- **Visibility**: Procurement, Storekeeper.

### Item Master Detail (`/portal/master-data/items/:id`)
- **New Sections**: A "Warehouse Stock" tab displaying current quantities grouped by store.
- **Visibility**: Anyone with `item.read` + `inventory.read`.

### Project Detail & WBS/Cost Code Detail (`/portal/projects/:id`)
- **New Fields**: `actual_amount` increases directly visible.
- **New Sections**: "Materials Issued" tab showing a feed of Material Issues hitting this WBS/Project.
- **Visibility**: PM, Site Engineer, Finance.

### Dashboard (General)
- **New Widgets**: "Pending PO Deliveries", "Recent Stock Movements".
- **Visibility**: Role-dependent layouts.

---

## 5. ROLE-BASED SCREEN ACCESS MATRIX

| Screen | Super/ERP Admin | Storekeeper | PM | Site Engineer | Procurement | Finance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stock Snapshot** | Visible | Visible | Visible | Visible | Visible | Visible |
| **Stock Ledger** | Visible | Visible | Hidden | Hidden | Hidden | Visible |
| **GRN List** | Visible | Visible | Visible | Hidden | Visible | Visible |
| **Create GRN** | Hidden | **CREATE** | Hidden | Hidden | Hidden | Hidden |
| **Issue List** | Visible | Visible | Visible | Visible | Hidden | Visible |
| **Create Issue** | Hidden | **CREATE** | Hidden | **CREATE** | Hidden | Hidden |
| **Stores List** | Edit | Read-Only | Hidden | Hidden | Hidden | Hidden |

> **IMPORTANT**: ERP Admin and Super Admin should generally *not* have transaction creation rights (separation of duties). They configure, they don't receive goods.

---

## 6. ROLE-BASED ACTION MATRIX

| Action | Storekeeper | PM | Site Engineer | Procurement | Finance | Admins |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| View Stock | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Ledger | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Create GRN | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View GRN | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Create Issue | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| View Issue | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| View PO Delivery Status | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Manage Stores | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 7. FORM DESIGN RULES

### Create GRN Form
- **Auto-fill Logic**: Selecting a PO auto-fills the `items` table.
- **Required Fields**: `storeId`, `poId`. In items: `qtyReceived`.
- **Validation Rules**:
  - `qtyReceived` > 0.
  - `qtyReceived` + `previously_received` MUST NOT exceed `PO.quantity`. (UI should block input > remaining).
- **Read-Only Fields**: PO unit price, Item Name.
- **Action Availability**: Submit button wraps mutation in an idempotency token to prevent double-click double-receipts.

### Create Material Issue Form
- **Dependent Fields**: Selecting `projectId` filters available `wbsId` options. Selecting general WBS filters available `costCodeId`s per line item.
- **Validation Rules**:
  - `issueQty` MUST be > 0.
  - `issueQty` MUST NOT exceed `Available Stock` for that item in that store. (UI max attribute).
- **Line-item Behavior**: Allows adding multiple items required for a single project WBS.

---

## 8. TABLE / DETAIL PAGE DESIGN

- **Stock Snapshot Table**: Expandable rows showing breakdown by Store, with color-coded badges for Qty > 0 (Green) vs Qty = 0 (Gray).
- **Ledger Detail**: Use sticky headers. Red text for `ISSUE_OUT` quantities, Green text for `GRN_IN`.
- **GRN / Issue Detail**: Standard read-only ERP layout. Header card with metadata (Date, Doc No, Store, Ref Doc). Full-width table below with line-items.

---

## 9. EXISTING FRONTEND IMPACT FROM DB CHANGES

- **`PurchaseOrder.delivery_status`**: Displayed as a primary pill badge next to the overall PO status on the PO List and Detail pages. Colors: Pending (Gray/Orange), Partial (Blue), Complete (Green).
- **`PurchaseOrderItem.received_quantity`**: In the PO Detail's line items table, add a new column: "Received / Ordered". Renders as a progress bar (e.g., `50 / 100`).
- **`CostCode.actual_amount`**: The WBS/Cost Code budget vs actual rings/charts will now automatically swell when `createIssue` is called. The UI should poll or refetch `GET /api/projects/:id` upon returning to the dashboard.

---

## 10. UI DATA FLOW

**The User Journey:**
1. Procurement posts **Approved PO**.
2. Vendor arrives at gate. Storekeeper opens **PO Detail Page**.
3. Storekeeper sees `[Receive Goods]` button active. Clicks it.
4. Routed to **Create GRN**, PO items pre-loaded. Inputs `50` units. Submits.
5. System routes back to PO Detail. `delivery_status` now says `partial`. Progress bar says `50/100`.
6. **Stock updates visible**: Live Stock page now shows `50` available.
7. Later, Site Engineer opens **Create Material Issue**.
8. Selects WBS "Foundation". Selects 10 units. Submits.
9. **Stock decreases**: Live Stock now shows `40`.
10. **Project/WBS updates**: Cost Code `actual_amount` increases by `10 * unit_cost`.

---

## 11. COMPONENT / STATE / API STRATEGY

- **Module Folder Structure**: `src/pages/inventory/`, `src/components/inventory/`
- **Reusable Components**:
  - `ItemSelect` dropdown (fetches catalog).
  - `StoreSelect` dropdown.
  - `DocumentHeader` card for View details.
- **State Management (React Query suggested)**:
  - Cache Keys: `['inventory', 'stock']`, `['inventory', 'ledger']`, `['grn', 'list']`.
  - **Invalidation Strategy**: After `createGRN` mutation succeeds, invalidate `['inventory', 'stock']` and `['purchase-orders']` immediately. After `createIssue`, invalidate `['inventory', 'stock']` and `['projects']`.

---

## 12. FRONTEND IMPLEMENTATION ORDER

**Safe Sprint Execution Flow:**
1. **Foundation**: Build `StoreSelect` and the Stock Snapshot UI page. Connect to `GET /api/inventory/stock`.
2. **PO Integration**: Update PO List and PO Detail pages to display `delivery_status` and `received_quantity`.
3. **GRN Inbound Flow**: Build the `Create GRN` form. Link the "Receive" button on PO Detail to this form. Handle submission and validation. Build GRN List & Detail screens.
4. **Outbound Flow**: Build the `Create Material Issue` form ensuring WBS/Cost Code cascading dropdowns work perfectly. Connect to `POST /api/inventory/issue`. Build Issue List & Detail.
5. **Auditing**: Build the `Stock Ledger` page for tracking movements.
6. **Polishing**: Add Sidebar guards based on RBAC. Add Dashboard summary widgets.

---

## 13. FINAL RECOMMENDATION

- **Recommended Now**: Execute Steps 1 through 4 of the Implementation Order above. This closes the procurement loop and gives immediate value to Site Engineers and Storekeepers.
- **Defer to Later**: Stock Adjustments (`ADJUST_IN`/`ADJUST_OUT`), Barcode scanning integrations, and Multi-warehouse transfer approvals.

---

### SPECIAL INSTRUCTION SUMMARY

**A. New screens list**
1. Inventory Dashboard
2. Stores List
3. Stock Snapshot
4. Stock Ledger
5. GRN List
6. Create GRN
7. GRN Detail
8. Material Issue List
9. Create Material Issue
10. Material Issue Detail

**B. Existing screens to modify**
1. Purchase Order List
2. Purchase Order Detail
3. Project Detail
4. WBS / Cost Code Detail
5. Item Master Detail

**C. Role access summary**
- **Admins**: View everything, manage stores. No transactional creation.
- **Storekeeper**: Create GRNs, Create Issues, View Stock/Ledger.
- **Site Engineer**: Create Issues, View Stock, View Project consumption.
- **Procurement**: View GRNs/Stock, track PO deliveries.
- **Finance**: View GRNs/Issues/Ledger for reconciliation.

**D. Frontend sprint execution order**
Sprint 1: Live Stock View & Stores
Sprint 2: PO Detail Updates & Create GRN Workflow
Sprint 3: Create Material Issue Workflow & Project Cost Sync
Sprint 4: Stock Ledger, Dashboards, and RBAC visibility hardening.
