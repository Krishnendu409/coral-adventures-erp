-- Day-to-day operational facts captured from the Excel workbooks on import.
-- No column here is ever a derived/computed metric (no revenue, profit, occupancy, etc.)

CREATE TABLE IF NOT EXISTS trips (
  trip_id             TEXT PRIMARY KEY,
  trip_date           TEXT NOT NULL,
  vessel_id           TEXT NOT NULL REFERENCES vessels(vessel_id),
  route_id            TEXT NOT NULL REFERENCES routes(route_id),
  cruise_type_id      TEXT NOT NULL REFERENCES cruise_types(cruise_type_id),
  slot                TEXT NOT NULL CHECK (slot IN ('morning', 'afternoon', 'evening')),
  scheduled_departure TEXT NOT NULL,
  actual_departure    TEXT,
  scheduled_return    TEXT NOT NULL,
  actual_return       TEXT,
  capacity            INTEGER NOT NULL,
  captain_crew_id     TEXT REFERENCES crew(crew_id),
  status              TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  cancellation_reason TEXT,
  import_batch_id     TEXT,
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(trip_date);
CREATE INDEX IF NOT EXISTS idx_trips_vessel ON trips(vessel_id);

CREATE TABLE IF NOT EXISTS trip_crew_assignments (
  assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id       TEXT NOT NULL REFERENCES trips(trip_id),
  crew_id       TEXT NOT NULL REFERENCES crew(crew_id),
  role_on_trip  TEXT NOT NULL,
  UNIQUE (trip_id, crew_id)
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id            TEXT PRIMARY KEY,
  full_name              TEXT NOT NULL,
  phone                  TEXT,
  email                  TEXT,
  city                   TEXT,
  customer_type          TEXT NOT NULL DEFAULT 'individual' CHECK (customer_type IN ('individual', 'corporate', 'agent')),
  acquisition_channel_id TEXT REFERENCES marketing_channels(channel_id),
  referred_by_customer_id TEXT REFERENCES customers(customer_id),
  first_trip_date        TEXT,
  notes                  TEXT
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

CREATE TABLE IF NOT EXISTS bookings (
  booking_id              TEXT PRIMARY KEY,
  trip_id                 TEXT NOT NULL REFERENCES trips(trip_id),
  customer_id             TEXT NOT NULL REFERENCES customers(customer_id),
  channel_id              TEXT REFERENCES marketing_channels(channel_id),
  booking_date            TEXT NOT NULL,
  passenger_count         INTEGER NOT NULL CHECK (passenger_count > 0),
  cruise_type_id          TEXT NOT NULL REFERENCES cruise_types(cruise_type_id),
  group_discount_applied  INTEGER NOT NULL DEFAULT 0 CHECK (group_discount_applied IN (0, 1)),
  status                  TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'no_show', 'completed')),
  booking_source          TEXT,
  import_batch_id         TEXT,
  notes                   TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);

CREATE TABLE IF NOT EXISTS payments (
  payment_id      TEXT PRIMARY KEY,
  booking_id      TEXT NOT NULL REFERENCES bookings(booking_id),
  amount_inr      INTEGER NOT NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
  payment_date    TEXT NOT NULL,
  payment_type    TEXT NOT NULL CHECK (payment_type IN ('ticket', 'onboard', 'charter', 'refund')),
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed')),
  import_batch_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

CREATE TABLE IF NOT EXISTS expenses (
  expense_id      TEXT PRIMARY KEY,
  trip_id         TEXT REFERENCES trips(trip_id),
  expense_date    TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('fuel', 'maintenance', 'salary', 'insurance', 'port_fees', 'marketing', 'inventory', 'other')),
  amount_inr      INTEGER NOT NULL,
  vendor_name     TEXT,
  description     TEXT,
  payment_status  TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending')),
  import_batch_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

CREATE TABLE IF NOT EXISTS fuel_logs (
  fuel_log_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id          TEXT NOT NULL REFERENCES trips(trip_id),
  liters_consumed  REAL NOT NULL,
  cost_inr         INTEGER NOT NULL,
  engine_hours     REAL NOT NULL,
  logged_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  maintenance_id  TEXT PRIMARY KEY,
  vessel_id       TEXT NOT NULL REFERENCES vessels(vessel_id),
  maintenance_date TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('scheduled', 'predictive', 'emergency')),
  component       TEXT NOT NULL,
  description     TEXT,
  cost_inr        INTEGER NOT NULL DEFAULT 0,
  downtime_hours  REAL NOT NULL DEFAULT 0,
  next_due_date   TEXT,
  performed_by    TEXT,
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
  import_batch_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_maintenance_vessel ON maintenance_records(vessel_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_next_due ON maintenance_records(next_due_date);

CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  movement_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         TEXT NOT NULL REFERENCES inventory_items(item_id),
  trip_id         TEXT REFERENCES trips(trip_id),
  movement_type   TEXT NOT NULL CHECK (movement_type IN ('restock', 'consumption', 'waste', 'shrinkage')),
  quantity        REAL NOT NULL,
  movement_date   TEXT NOT NULL,
  unit_cost_inr   INTEGER,
  notes           TEXT,
  import_batch_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON inventory_stock_movements(item_id);

CREATE TABLE IF NOT EXISTS weather_logs (
  weather_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id         TEXT REFERENCES trips(trip_id),
  log_date        TEXT NOT NULL,
  condition       TEXT NOT NULL,
  wind_speed_kmh  REAL,
  wave_height_m   REAL,
  temperature_c   REAL,
  visibility      TEXT,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS events (
  event_id           TEXT PRIMARY KEY,
  trip_id            TEXT REFERENCES trips(trip_id),
  event_type         TEXT NOT NULL CHECK (event_type IN ('wedding', 'corporate', 'birthday', 'charter', 'other')),
  event_date         TEXT NOT NULL,
  client_name        TEXT NOT NULL,
  contract_value_inr INTEGER,
  notes              TEXT
);
