# Week 5 Frontend Execution Checklist

## 1. FILES TO CREATE
- `src/pages/inventory/Dashboard/InventoryDashboard.jsx`
- `src/pages/inventory/Stores/StoresList.jsx`
- `src/pages/inventory/Stock/StockSnapshot.jsx`
- `src/pages/inventory/Stock/StockLedger.jsx`
- `src/pages/inventory/GRN/GRNList.jsx`
- `src/pages/inventory/GRN/CreateGRN.jsx`
- `src/pages/inventory/GRN/GRNDetail.jsx`
- `src/pages/inventory/Issue/IssueList.jsx`
- `src/pages/inventory/Issue/CreateIssue.jsx`
- `src/pages/inventory/Issue/IssueDetail.jsx`
- `src/services/inventoryService.js` (Axios API calls for inventory endpoints)
- `src/hooks/useInventory.js` (React Query hooks for caching/invalidation)

## 2. FILES TO UPDATE
- `src/App.js` or `src/routes/index.js` (To register new routes)
- `src/components/Sidebar/SidebarConfig.js` (To add Inventory menu)
- `src/pages/procurement/PurchaseOrders/POList.jsx`
- `src/pages/procurement/PurchaseOrders/PODetail.jsx`
- `src/pages/projects/ProjectDetail.jsx`
- `src/pages/wbs/WBSDetail.jsx`
- `src/pages/masterData/items/ItemList.jsx`
- `src/pages/masterData/items/ItemDetail.jsx`
- `src/pages/dashboard/CompanyDashboard.jsx`

## 3. ROUTE REGISTRATION STEPS
1. Open `src/routes/index.js` (or primary routing file).
2. Import all components from `src/pages/inventory/*`.
3. Inside the protected `<PortalLayout>` wrapper, map the `inventoryRoutes` exactly as defined in `inventory_frontend_spec.js`.
4. Wrap each route element with `<RequirePermission perm="<permission_name>">` to guard route mounting directly.

## 4. SIDEBAR REGISTRATION STEPS
1. Open `src/components/Sidebar/SidebarConfig.js` or equivalent.
2. Insert the `inventorySidebarMenu` object payload.
3. Ensure the Sidebar rendering component respects the top-level `inventory.read` permission guard before rendering the category header.

## 5. PAGE-BY-PAGE IMPLEMENTATION TASKS
- **StockSnapshot**: Build table using `stockTableColumns`. Implement `storeId` and `itemId` filter inputs. Map `actions` link to Ledger.
- **StockLedger**: Build table using `ledgerTableColumns`. Extract `itemId` from URL params. Render positive/negative colors based on `move_type`.
- **GRNList**: Build table using `grnTableColumns`. Implement `poId` and `storeId` filters.
- **CreateGRN**: Build master-detail screen. Master: PO and Store dropdowns. Detail: Line items mapped dynamically from `PO` response. Implement validation logic (`qtyReceived > 0 && max <= ordered_qty - prev_qty`).
- **GRNDetail**: Build read-only header/detail view using `grnDetailLayout`.
- **IssueList**: Build table using `issueTableColumns`. Build filters for Project, WBS, and Store.
- **CreateIssue**: Build cascade dropdowns (Project -> WBS -> Cost Code). Pull `itemId` from selected Store stock. Apply max validation to `available_stock`.
- **IssueDetail**: Build read-only header/detail view using `issueDetailLayout`.
- **StoresList**: Build simple table for stores. Add "Create Store" modal tied to `settings.manage` permission. **(Note: Check tenant data scope)**
- **InventoryDashboard**: Build overview widgets. Fetch data via standard list endpoints with `limit=5`.

## 6. EXISTING SCREEN PATCH TASKS
- **PO List**: Add `delivery_status` badge column.
- **PO Detail**: Render `delivery_status` badge in header. Inject `[Receive Goods]` button wrapped in `po_allow_receive` visibility logic. Add new "GRNs" tab loading `<GRNList poId={po.id} />`.
- **Project Detail**: Create "Actual Material Cost" widget. Create "Material Issues" tab. Attach `[Issue Material]` button linking to CreateIssue with `?projectId=xyz`.
- **WBS Detail**: Create "Issues To Node" tab. Attach `[Issue Material Here]` button linking to CreateIssue with `?projectId=xyz&wbsId=abc`.
- **Item List**: Append `Global Stock Qty` column wrapped in `RequirePermission` for `inventory.read`.
- **Item Detail**: Create "Warehouse Stock" and "Movement Ledger" tabs using parameterized Snapshot/Ledger components.
- **Dashboard**: Embed "Recent GRNs / Pending Deliveries" widget on Storekeeper persona dashboard views.

## 7. API DEPENDENCIES
- `GET /api/inventory/stock` (Required)
- `GET /api/inventory/ledger/:itemId` (Required)
- `GET /api/inventory/grn` (Required)
- `POST /api/inventory/grn` (Required)
- `GET /api/inventory/issue` (Required)
- `POST /api/inventory/issue` (Required)
- `GET /api/purchase-orders?status=approved&delivery_status=pending,partial` (Required)
- `GET /api/projects` (Required)
- `GET /api/wbs?project_id=xyz` (Required)
- `GET /api/cost-codes?wbs_id=xyz&category=material` (Required)
- `GET /api/inventory/stores` (**FLAGGED**: Missing generic CRUD, implement or fetch via stock filters).
- `GET /api/dashboard/inventory` (**FLAGGED**: Missing aggregation endpoint; use client-side derived data or create backend service).

## 8. PERMISSION DEPENDENCIES
- **Screens**:
  - `inventory.read`: StockSnapshot, GRNList, GRNDetail, IssueList, IssueDetail, StoresList, InventoryDashboard
  - `inventory.ledger.read`: StockLedger
  - `inventory.grn.create`: CreateGRN
  - `inventory.issue.create`: CreateIssue
- **Actions**:
  - `settings.manage`: Create/Edit Stores Configuration Mode
  - `inventory.consume.read`: View Actual Costs widgets on Project/WBS screens
- **API Flow Rule**: Frontend must silently hide elements if permissions are missing; do not throw crash errors.

## 9. QA CHECKLIST
- [ ] **Route Guards**: Attempt direct URL navigation to `/grn/create` without `inventory.grn.create`. Must bounce/403.
- [ ] **Hidden Buttons**: Log in as Site Engineer; confirm `[Receive Goods]` button on PO Detail is invisible.
- [ ] **Create Flow Validation**: In Create GRN, attempt to receive 110 units of a 100-qty PO. Must block form submission.
- [ ] **Empty States**: Verify Stock Ledger on an unused item displays "No data available" gracefully.
- [ ] **API Failure States**: Turn off network, load `/inventory/stock`. Confirm "Failed to load" boundary message appears.
- [ ] **Prefilled Issue Flow**: Click `[Issue Material]` on Foundation WBS. Confirm WBS and Project are locked/auto-filled in the form.
- [ ] **Delivery Status Updates**: Submit GRN. Return to PO Detail. Ensure status transitioned from `pending` -> `partial` or `complete`.

## 10. BLOCKERS / ASSUMPTIONS
- **Stores API**: We assume `/api/inventory/stores` will exist, or the frontend team will write a bypass (like mapping over `/api/inventory/stock`).
- **Dashboard API**: We assume the frontend will derive dashboard totals from standard list calls until a dedicated `/dashboard` endpoint is created.
- **Idempotency Headers**: We assume the Axios instance allows custom headers like `X-Idempotency-Key` for POST transactions without CORS blocking.

## 11. DATA TENANT ISOLATION (MULTI-COMPANY CHECK)
- **CRITICAL**: The backend uses JWT `company_id` for scoping. The frontend does not pass `companyId` in bodies to prevent spoofing.
- **Validation**:
  - The frontend MUST test loading Stores or GRNs authenticated as `Company A` and verifying no data from `Company B` is visible in list lookups, particularly in the `Create GRN` dropdowns.
  - All Dropdowns (Stored, WBS, Projects, POs) inherently inherit the `applyDataScope(req.user)` on the backend. Frontend QA must confirm no cross-tenant bleeding occurs in search selects.
