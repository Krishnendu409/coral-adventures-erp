-- Reference / configuration data. Rarely changes. Everything downstream (facts) points here via FK.

CREATE TABLE IF NOT EXISTS vessels (
  vessel_id         TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  capacity          INTEGER NOT NULL,
  book_value_inr    INTEGER NOT NULL,
  commissioned_date TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'decommissioned')),
  notes             TEXT
);

CREATE TABLE IF NOT EXISTS routes (
  route_id     TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  origin       TEXT NOT NULL,
  destination  TEXT NOT NULL,
  distance_nm  REAL,
  duration_hrs REAL NOT NULL,
  description  TEXT
);

CREATE TABLE IF NOT EXISTS cruise_types (
  cruise_type_id   TEXT PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  base_price_inr   INTEGER NOT NULL,
  description      TEXT
);

CREATE TABLE IF NOT EXISTS crew (
  crew_id           TEXT PRIMARY KEY,
  full_name         TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('captain', 'crew', 'shore_staff')),
  phone             TEXT,
  license_number    TEXT,
  monthly_salary_inr INTEGER NOT NULL,
  joined_date       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'departed')),
  notes             TEXT
);

CREATE TABLE IF NOT EXISTS marketing_channels (
  channel_id              TEXT PRIMARY KEY,
  category                TEXT NOT NULL,
  name                    TEXT NOT NULL,
  description             TEXT,
  target_audience         TEXT,
  market_size_inr         INTEGER,
  reachable_persons_year  INTEGER,
  reach_pct               REAL,
  peak_months             TEXT,
  seasonality_index       REAL,
  active_months           INTEGER,
  capture_rate            REAL,
  lead_rate               REAL,
  conversion_rate         REAL,
  repeat_rate             REAL,
  referral_rate           REAL,
  avg_group_size          REAL,
  planned_annual_spend_inr INTEGER,
  risk_level              TEXT CHECK (risk_level IN ('Low', 'Medium', 'High')),
  data_confidence         TEXT,
  priority                INTEGER,
  scalability             TEXT,
  rollout_phase           TEXT,
  recommendation          TEXT,
  is_active               INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS inventory_items (
  item_id        TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  unit           TEXT NOT NULL,
  reorder_level  REAL NOT NULL DEFAULT 0,
  reorder_qty    REAL NOT NULL DEFAULT 0,
  unit_cost_inr  INTEGER NOT NULL DEFAULT 0,
  vendor_name    TEXT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discontinued'))
);

-- Editable, source-tracked business assumptions. Seeded from the real Master
-- Assumptions workbook (see docs/business/master-assumptions-extract.json).
-- Every KPI formula in the analytics engine reads its inputs from here at
-- request time instead of hardcoding numbers — this table IS the config.
CREATE TABLE IF NOT EXISTS business_parameters (
  param_id      TEXT PRIMARY KEY,
  parameter     TEXT NOT NULL,
  value         REAL,
  unit          TEXT,
  min_value     REAL,
  max_value     REAL,
  source        TEXT,
  confidence    TEXT,
  category      TEXT,
  notes         TEXT,
  erp_field     TEXT NOT NULL UNIQUE,
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
  user_id       TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);
