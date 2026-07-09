CREATE TABLE IF NOT EXISTS pricing_rules (
  rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  season TEXT NOT NULL,
  min_occupancy REAL NOT NULL,
  max_occupancy REAL NOT NULL,
  price_modifier_percent INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS competitor_prices (
  comp_id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_name TEXT NOT NULL,
  cruise_type_id TEXT NOT NULL REFERENCES cruise_types(cruise_type_id),
  ticket_price_inr INTEGER NOT NULL,
  date_collected TEXT NOT NULL
);
