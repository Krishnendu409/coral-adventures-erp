-- Marketing execution + customer voice facts. Feeds Marketing Intelligence
-- and the Marketing Planning System (funnel: footfall -> capture -> leads ->
-- conversion -> bookings), all computed live from these rows + marketing_channels.

CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id       TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL REFERENCES marketing_channels(channel_id),
  name              TEXT NOT NULL,
  start_date        TEXT NOT NULL,
  end_date          TEXT,
  budget_inr        INTEGER NOT NULL,
  actual_spend_inr  INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'paused'))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_channel ON campaigns(channel_id);

CREATE TABLE IF NOT EXISTS leads (
  lead_id               TEXT PRIMARY KEY,
  channel_id            TEXT REFERENCES marketing_channels(channel_id),
  campaign_id           TEXT REFERENCES campaigns(campaign_id),
  customer_id           TEXT REFERENCES customers(customer_id),
  captured_date         TEXT NOT NULL,
  contact_info          TEXT,
  status                TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  converted_booking_id  TEXT REFERENCES bookings(booking_id)
);
CREATE INDEX IF NOT EXISTS idx_leads_channel ON leads(channel_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

CREATE TABLE IF NOT EXISTS feedback (
  feedback_id       TEXT PRIMARY KEY,
  trip_id           TEXT NOT NULL REFERENCES trips(trip_id),
  customer_id       TEXT REFERENCES customers(customer_id),
  rating_overall    INTEGER CHECK (rating_overall BETWEEN 1 AND 5),
  rating_captain    INTEGER CHECK (rating_captain BETWEEN 1 AND 5),
  rating_hospitality INTEGER CHECK (rating_hospitality BETWEEN 1 AND 5),
  rating_value      INTEGER CHECK (rating_value BETWEEN 1 AND 5),
  nps_score         INTEGER CHECK (nps_score BETWEEN 0 AND 10),
  comments          TEXT,
  submitted_date    TEXT NOT NULL,
  import_batch_id   TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_trip ON feedback(trip_id);

CREATE TABLE IF NOT EXISTS complaints (
  complaint_id      TEXT PRIMARY KEY,
  trip_id           TEXT REFERENCES trips(trip_id),
  customer_id       TEXT REFERENCES customers(customer_id),
  category          TEXT NOT NULL,
  description       TEXT NOT NULL,
  severity          TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
  resolution_notes  TEXT,
  filed_date        TEXT NOT NULL,
  resolved_date     TEXT
);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
