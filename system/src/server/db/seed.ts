import fs from "node:fs";
import path from "node:path";
import { getDb } from "./client";
import { migrate } from "./migrate";
import { DOCS_BUSINESS_DIR } from "../config/paths";
import { ID_PREFIX, nextId } from "../domain/ids";

interface AssumptionRow {
  id: string;
  parameter: string;
  value: number | null;
  unit: string | null;
  min: number | null;
  max: number | null;
  source: string | null;
  confidence: string | null;
  category: string | null;
  notes: string | null;
  erp_field: string;
}

interface ChannelRow {
  id: string;
  category: string;
  name: string;
  description: string | null;
  target_audience: string | null;
  market_size_inr: number | null;
  reachable_persons_year: number | null;
  reach_pct: number | null;
  peak_months: string | null;
  seasonality_index: number | null;
  active_months: number | null;
  capture_rate: number | null;
  lead_rate: number | null;
  conversion_rate: number | null;
  repeat_rate: number | null;
  referral_rate: number | null;
  avg_group_size: number | null;
  annual_mktg_spend_inr: number | null;
  risk_level: string | null;
  data_confidence: string | null;
  priority: number | null;
  scalability: string | null;
  rollout_phase: string | null;
  recommendation: string | null;
}

function loadJson<T>(filename: string): T {
  const filePath = path.join(DOCS_BUSINESS_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function param(db: ReturnType<typeof getDb>, erpField: string): number {
  const row = db.prepare("SELECT value FROM business_parameters WHERE erp_field = ?").get(erpField) as
    | { value: number }
    | undefined;
  if (!row || row.value === null) {
    throw new Error(`seed: missing business_parameters.value for erp_field '${erpField}'`);
  }
  return row.value;
}

function seedBusinessParameters(db: ReturnType<typeof getDb>): void {
  const { assumptions } = loadJson<{ assumptions: AssumptionRow[] }>("master-assumptions-extract.json");

  const upsert = db.prepare(`
    INSERT INTO business_parameters (param_id, parameter, value, unit, min_value, max_value, source, confidence, category, notes, erp_field)
    VALUES (@id, @parameter, @value, @unit, @min, @max, @source, @confidence, @category, @notes, @erp_field)
    ON CONFLICT(param_id) DO UPDATE SET
      parameter = excluded.parameter, value = excluded.value, unit = excluded.unit,
      min_value = excluded.min_value, max_value = excluded.max_value, source = excluded.source,
      confidence = excluded.confidence, category = excluded.category, notes = excluded.notes,
      erp_field = excluded.erp_field, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `);

  for (const row of assumptions) {
    const { id, parameter, value, unit, min, max, source, confidence, category, notes, erp_field } = row as any;
    upsert.run({ id, parameter, value, unit, min, max, source, confidence, category, notes, erp_field });
  }
  console.log(`[seed] business_parameters: ${assumptions.length} rows`);
}

function seedMarketingChannels(db: ReturnType<typeof getDb>): void {
  const { channels } = loadJson<{ channels: ChannelRow[] }>("channel-intelligence-extract.json");

  const upsert = db.prepare(`
    INSERT INTO marketing_channels (
      channel_id, category, name, description, target_audience, market_size_inr,
      reachable_persons_year, reach_pct, peak_months, seasonality_index, active_months,
      capture_rate, lead_rate, conversion_rate, repeat_rate, referral_rate, avg_group_size,
      planned_annual_spend_inr, risk_level, data_confidence, priority, scalability, rollout_phase, recommendation
    ) VALUES (
      @channel_id, @category, @name, @description, @target_audience, @market_size_inr,
      @reachable_persons_year, @reach_pct, @peak_months, @seasonality_index, @active_months,
      @capture_rate, @lead_rate, @conversion_rate, @repeat_rate, @referral_rate, @avg_group_size,
      @annual_mktg_spend_inr, @risk_level, @data_confidence, @priority, @scalability, @rollout_phase, @recommendation
    )
    ON CONFLICT(channel_id) DO UPDATE SET
      category = excluded.category, name = excluded.name, description = excluded.description,
      target_audience = excluded.target_audience, market_size_inr = excluded.market_size_inr,
      reachable_persons_year = excluded.reachable_persons_year, reach_pct = excluded.reach_pct,
      peak_months = excluded.peak_months, seasonality_index = excluded.seasonality_index,
      active_months = excluded.active_months, capture_rate = excluded.capture_rate,
      lead_rate = excluded.lead_rate, conversion_rate = excluded.conversion_rate,
      repeat_rate = excluded.repeat_rate, referral_rate = excluded.referral_rate,
      avg_group_size = excluded.avg_group_size, planned_annual_spend_inr = excluded.planned_annual_spend_inr,
      risk_level = excluded.risk_level, data_confidence = excluded.data_confidence,
      priority = excluded.priority, scalability = excluded.scalability,
      rollout_phase = excluded.rollout_phase, recommendation = excluded.recommendation
  `);

  for (const row of channels) {
    const num = row.id.replace(/^C/, "").padStart(3, "0");
    const { category, name, description, target_audience, market_size_inr,
      reachable_persons_year, reach_pct, peak_months, seasonality_index, active_months,
      capture_rate, lead_rate, conversion_rate, repeat_rate, referral_rate, avg_group_size,
      annual_mktg_spend_inr, risk_level, data_confidence, priority, scalability, rollout_phase, recommendation } = row as any;
    
    upsert.run({
      channel_id: `CA-CHN-${num}`, category, name, description, target_audience, market_size_inr,
      reachable_persons_year, reach_pct, peak_months, seasonality_index, active_months,
      capture_rate, lead_rate, conversion_rate, repeat_rate, referral_rate, avg_group_size,
      annual_mktg_spend_inr, risk_level, data_confidence, priority, scalability, rollout_phase, recommendation
    });
  }
  console.log(`[seed] marketing_channels: ${channels.length} rows`);
}

/** Vessel/route/cruise-type are singletons for v1 (one boat, one circuit) — only ever seeded once. */
function seedFleetIfEmpty(db: ReturnType<typeof getDb>): void {
  const vesselCount = (db.prepare("SELECT COUNT(*) AS n FROM vessels").get() as { n: number }).n;
  if (vesselCount > 0) {
    console.log("[seed] fleet already seeded, skipping vessels/routes/cruise_types");
    return;
  }

  const capacity = param(db, "vessel_capacity");
  const vesselValue = param(db, "vessel_value");
  const tripDurationHrs = param(db, "trip_duration_hrs");
  const ticketStandard = param(db, "ticket_price_standard");
  const ticketPremium = param(db, "ticket_price_premium");
  const charterRate = param(db, "charter_rate");

  const vesselId = nextId(db, ID_PREFIX.vessel);
  db.prepare(
    `INSERT INTO vessels (vessel_id, name, capacity, book_value_inr, commissioned_date, status, notes)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`
  ).run(
    vesselId,
    "MV Coral Adventure",
    capacity,
    Math.round(vesselValue),
    "2026-07-01",
    "First and, for now, only vessel in the fleet — see business_parameters.vessel_capacity/vessel_value."
  );

  const routeId = nextId(db, ID_PREFIX.route);
  db.prepare(
    `INSERT INTO routes (route_id, name, origin, destination, distance_nm, duration_hrs, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    routeId,
    "Malpe Beach Circuit",
    "Malpe Beach, Udupi",
    "St. Mary's Island coastal waters",
    null,
    tripDurationHrs,
    "Standard coastal cruise circuit launched from Malpe Beach, Udupi, Karnataka."
  );

  const cruiseTypes: Array<[string, number, string]> = [
    ["Standard", ticketStandard, "Standard 2.5hr cruise, base ticket price."],
    ["Premium / Sunset", ticketPremium, "Sunset cruise, premium experience with snacks included."],
    ["Charter", charterRate, "Full-vessel charter for corporate, wedding, or private events."],
  ];
  const insertCruiseType = db.prepare(
    `INSERT INTO cruise_types (cruise_type_id, name, base_price_inr, description) VALUES (?, ?, ?, ?)`
  );
  for (const [name, price, description] of cruiseTypes) {
    insertCruiseType.run(nextId(db, ID_PREFIX.cruiseType), name, Math.round(price), description);
  }

  console.log("[seed] fleet: 1 vessel, 1 route, 3 cruise types");
}

export function seed(): void {
  migrate();
  const db = getDb();
  const runSeed = db.transaction(() => {
    seedBusinessParameters(db);
    seedMarketingChannels(db);
    seedFleetIfEmpty(db);
  });
  runSeed();
}

if (require.main === module) {
  seed();
  console.log("[seed] done.");
}
