-- =============================================================================
-- WEEK 6 PHASE 1: PROJECT INITIATION + ENGINEERING PLANNING
-- Tables: project_plans, boq_validations, project_schedules,
--         procurement_plan_items, resource_plans
-- =============================================================================

SET search_path TO auth;

-- ─── 1. project_plans (Master Plan header) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.project_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES auth.companies(id),
  project_id       UUID NOT NULL REFERENCES auth.projects(id) ON DELETE CASCADE,
  plan_no          VARCHAR(100) UNIQUE NOT NULL,
  title            VARCHAR(500) NOT NULL,
  plan_type        VARCHAR(50)  NOT NULL DEFAULT 'BASELINE',  -- BASELINE | REVISED | APPROVED
  status           VARCHAR(30)  NOT NULL DEFAULT 'draft',      -- draft | submitted | in_approval | approved | rejected
  version          INT          NOT NULL DEFAULT 1,
  -- Baseline schedule summary
  baseline_start   DATE,
  baseline_end     DATE,
  baseline_duration INT,      -- working days
  contract_value   DECIMAL,
  -- Approval gate: project cannot proceed without this being 'approved'
  approved_by      UUID REFERENCES auth.users(id),
  approved_at      TIMESTAMP,
  approval_remarks TEXT,
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_plans_proj ON auth.project_plans(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_plans_co   ON auth.project_plans(company_id, status);

-- ─── 2. boq_validations (BOQ ↔ WBS ↔ CostCode validation records) ────────────
CREATE TABLE IF NOT EXISTS auth.boq_validations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES auth.companies(id),
  project_id       UUID NOT NULL REFERENCES auth.projects(id) ON DELETE CASCADE,
  plan_id          UUID REFERENCES auth.project_plans(id) ON DELETE CASCADE,
  boq_item_id      UUID NOT NULL REFERENCES auth.boq_items(id) ON DELETE CASCADE,
  wbs_id           UUID NOT NULL REFERENCES auth.wbs(id),
  cost_code_id     UUID REFERENCES auth.cost_codes(id),
  -- Validation flags
  is_wbs_linked    BOOLEAN NOT NULL DEFAULT FALSE,
  is_cost_coded    BOOLEAN NOT NULL DEFAULT FALSE,
  is_rate_valid    BOOLEAN NOT NULL DEFAULT FALSE,    -- unit_rate > 0
  is_complete      BOOLEAN NOT NULL DEFAULT FALSE,    -- all flags TRUE
  validation_errors JSONB,                             -- array of error strings
  validated_by     UUID REFERENCES auth.users(id),
  validated_at     TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_boq_validation ON auth.boq_validations(boq_item_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_boq_val_proj ON auth.boq_validations(project_id, is_complete);

-- ─── 3. project_schedules (Baseline schedule per WBS) ────────────────────────
CREATE TABLE IF NOT EXISTS auth.project_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES auth.companies(id),
  project_id       UUID NOT NULL REFERENCES auth.projects(id) ON DELETE CASCADE,
  plan_id          UUID REFERENCES auth.project_plans(id) ON DELETE CASCADE,
  wbs_id           UUID NOT NULL REFERENCES auth.wbs(id),
  sequence_no      INT  NOT NULL DEFAULT 0,          -- Gantt sequence
  baseline_start   DATE NOT NULL,
  baseline_end     DATE NOT NULL,
  baseline_duration INT,                             -- working days
  -- Actuals (updated by DPR engine)
  actual_start     DATE,
  actual_end       DATE,
  float_days       INT  DEFAULT 0,                   -- schedule float
  is_critical      BOOLEAN NOT NULL DEFAULT FALSE,    -- on critical path
  dependencies     JSONB,                             -- [{wbs_id, type:'FS|SS|FF|SF', lag:0}]
  -- Predecessor types: FS=Finish-to-Start, SS=Start-to-Start, FF=Finish-to-Finish
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_proj_schedule ON auth.project_schedules(plan_id, wbs_id);
CREATE INDEX IF NOT EXISTS idx_proj_sched_proj ON auth.project_schedules(project_id, is_critical);

-- ─── 4. procurement_plan_items (Long-lead + supply chain planning) ────────────
CREATE TABLE IF NOT EXISTS auth.procurement_plan_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES auth.companies(id),
  project_id       UUID NOT NULL REFERENCES auth.projects(id) ON DELETE CASCADE,
  plan_id          UUID REFERENCES auth.project_plans(id) ON DELETE CASCADE,
  wbs_id           UUID REFERENCES auth.wbs(id),
  item_description VARCHAR(500) NOT NULL,
  category         VARCHAR(100),                      -- MATERIAL | EQUIPMENT | SUBCONTRACT | SERVICE
  estimated_cost   DECIMAL DEFAULT 0,
  required_date    DATE,
  lead_time_days   INT DEFAULT 0,
  is_long_lead     BOOLEAN NOT NULL DEFAULT FALSE,    -- KEY FLAG: marks items requiring early ordering
  vendor_id        UUID REFERENCES auth.vendors(id),  -- preferred vendor (from vendor registry)
  pr_required_by   DATE,                              -- when PR must be raised (required_date - lead_time)
  status           VARCHAR(30) NOT NULL DEFAULT 'planned', -- planned|pr_raised|po_issued|delivered
  linked_pr_id     UUID REFERENCES auth.purchase_requisitions(id),
  linked_po_id     UUID REFERENCES auth.purchase_orders(id),
  notes            TEXT,
  attachments      JSONB,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proc_plan_proj  ON auth.procurement_plan_items(project_id, is_long_lead);
CREATE INDEX IF NOT EXISTS idx_proc_plan_status ON auth.procurement_plan_items(project_id, status);

-- ─── 5. resource_plans (Manpower + Equipment planning per WBS) ────────────────
CREATE TABLE IF NOT EXISTS auth.resource_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES auth.companies(id),
  project_id       UUID NOT NULL REFERENCES auth.projects(id) ON DELETE CASCADE,
  plan_id          UUID REFERENCES auth.project_plans(id) ON DELETE CASCADE,
  wbs_id           UUID REFERENCES auth.wbs(id),
  resource_type    VARCHAR(20) NOT NULL,              -- MANPOWER | EQUIPMENT
  -- Manpower fields
  trade            VARCHAR(100),
  headcount        INT DEFAULT 1,
  daily_rate       DECIMAL,
  planned_days     INT DEFAULT 0,
  manpower_cost    DECIMAL GENERATED ALWAYS AS (headcount * planned_days * COALESCE(daily_rate, 0)) STORED,
  -- Equipment fields
  equipment_type   VARCHAR(100),
  equipment_count  INT DEFAULT 1,
  hire_rate        DECIMAL,
  planned_hours    DECIMAL DEFAULT 0,
  equipment_cost   DECIMAL GENERATED ALWAYS AS (equipment_count * planned_hours * COALESCE(hire_rate, 0)) STORED,
  -- Timing
  planned_start    DATE,
  planned_end      DATE,
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resource_plan_proj ON auth.resource_plans(project_id, resource_type);
CREATE INDEX IF NOT EXISTS idx_resource_plan_plan ON auth.resource_plans(plan_id);
