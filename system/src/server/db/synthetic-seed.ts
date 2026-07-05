// Synthetic historical data generator.
//
// Purpose: give the app ~9 months of realistic, internally-consistent demo
// data so dashboards/analytics have something to render during development,
// without waiting for real Excel trip imports. Every number here is either
// read directly from the real business_parameters / marketing_channels rows
// (already seeded from the Master Assumptions + Channel Intelligence
// workbooks) or derived from them with a documented, reasonable assumption.
//
// IMPORTANT: this file writes FACTS ONLY (trips, bookings, payments, fuel,
// expenses, leads, feedback, ...). It never writes a KPI/derived column
// (revenue, profit, occupancy, CAC, LTV, ROI, NPS, ...) — those are computed
// live by the analytics engine from the rows this script inserts.
//
// Usage:
//   npm run db:seed:synthetic            # generate once (idempotent no-op if trips already exist)
//   npm run db:seed:synthetic -- --force # wipe all 002/003 fact tables and regenerate
//
// The RNG is seeded (mulberry32) so re-runs without --force are inert, and a
// --force re-run reproduces the same dataset deterministically.

import { getDb } from "./client";
import { seed } from "./seed";
import { ID_PREFIX, nextId } from "../domain/ids";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic, no bare Math.random() anywhere.
// ---------------------------------------------------------------------------

const RNG_SEED = 0xc0a1_a0da; // "coral ada" — fixed so runs are reproducible

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function random(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(RNG_SEED);

function randFloat(min: number, max: number): number {
  return min + rng() * (max - min);
}
function randInt(min: number, max: number): number {
  return Math.floor(randFloat(min, max + 1));
}
function chance(p: number): boolean {
  return rng() < p;
}
function choice<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function weightedChoice<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + Math.max(b, 0), 0);
  if (total <= 0) return choice(items);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(weights[i], 0);
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}
function round(x: number): number {
  return Math.round(x);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function atHour(d: Date, hour: number, minute = 0): Date {
  const r = new Date(d);
  r.setUTCHours(hour, minute, 0, 0);
  return r;
}
function timestamp(d: Date): string {
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Date range: last ~270 days ending on 2026-07-04 (today).
// ---------------------------------------------------------------------------

const END_DATE = new Date("2026-07-04T00:00:00.000Z");
const TOTAL_DAYS = 270;
const START_DATE = addDays(END_DATE, -(TOTAL_DAYS - 1));

type Season = "peak" | "shoulder" | "off";

/** Oct-Feb peak, Mar-May shoulder, Jun-Sep monsoon off-season (matches business_parameters A04-A06). */
function seasonForMonth(monthIndex0: number): Season {
  if ([9, 10, 11, 0, 1].includes(monthIndex0)) return "peak";
  if ([2, 3, 4].includes(monthIndex0)) return "shoulder";
  return "off";
}

// ---------------------------------------------------------------------------
// Name pools (realistic Indian names for Karnataka coastal setting).
// ---------------------------------------------------------------------------

const MALE_FIRST = [
  "Aditya", "Rohan", "Vikram", "Suresh", "Ganesh", "Praveen", "Nitin", "Sandeep",
  "Ramesh", "Manoj", "Arjun", "Karthik", "Deepak", "Naveen", "Ashwin", "Vinay",
  "Prakash", "Raghav", "Siddharth", "Harish", "Yathish", "Chandan", "Sujith", "Akshay",
];
const FEMALE_FIRST = [
  "Priya", "Anjali", "Sneha", "Divya", "Pooja", "Meera", "Lakshmi", "Kavya",
  "Nisha", "Shreya", "Anitha", "Deepa", "Rashmi", "Swathi", "Vidya", "Roopa",
  "Nayana", "Shilpa", "Aishwarya", "Bhavana", "Preethi", "Sowmya",
];
const LAST_NAMES = [
  "Shetty", "Rao", "Kamath", "Pai", "Hegde", "Nayak", "Prabhu", "Bhat",
  "Kulkarni", "Salian", "Bhandary", "Kotian", "Poojary", "Amin", "Suvarna", "Baliga",
  "Achar", "Naik", "Adiga", "Shenoy",
];
const CORPORATE_NAMES = [
  "Manipal Tech Solutions", "Coastal Software Pvt Ltd", "Udupi Health Systems",
  "Konkan Exports Ltd", "Mangalore Infotech", "Karavali Manufacturing Co",
  "MAHE Alumni Association", "Malpe Marine Traders",
];

function randomFullName(): string {
  const isMale = chance(0.52);
  const first = choice(isMale ? MALE_FIRST : FEMALE_FIRST);
  return `${first} ${choice(LAST_NAMES)}`;
}
function randomPhone(): string {
  return `9${randInt(400000000, 899999999)}`;
}
function randomCity(): string {
  return choice(["Udupi", "Manipal", "Mangalore", "Malpe", "Kundapura", "Bangalore", "Mysore", "Hubli"]);
}

// ---------------------------------------------------------------------------
// Business parameter access (read what seed.ts already loaded).
// ---------------------------------------------------------------------------

function loadParams(db: Database.Database): Map<string, number> {
  const rows = db.prepare("SELECT erp_field, value FROM business_parameters WHERE value IS NOT NULL").all() as {
    erp_field: string;
    value: number;
  }[];
  return new Map(rows.map((r) => [r.erp_field, r.value]));
}
function p(params: Map<string, number>, field: string): number {
  const v = params.get(field);
  if (v === undefined) throw new Error(`synthetic-seed: missing business_parameters value for '${field}'`);
  return v;
}

interface ChannelRec {
  channel_id: string;
  name: string;
  category: string;
  reach_pct: number | null;
  priority: number | null;
  conversion_rate: number | null;
  referral_rate: number | null;
  repeat_rate: number | null;
  seasonality_index: number | null;
  planned_annual_spend_inr: number | null;
}
interface CruiseTypeRec {
  cruise_type_id: string;
  name: string;
  base_price_inr: number;
}
interface VesselRec {
  vessel_id: string;
  capacity: number;
  book_value_inr: number;
}
interface RouteRec {
  route_id: string;
  duration_hrs: number;
}
interface CrewRec {
  crew_id: string;
  full_name: string;
  role: "captain" | "crew" | "shore_staff";
  monthly_salary_inr: number;
}
interface ItemRec {
  item_id: string;
  name: string;
  category: string;
  reorder_qty: number;
  unit_cost_inr: number;
}

// ---------------------------------------------------------------------------
// Fact tables this script owns (schema files 002 + 003). NOT the reference
// tables from 001 (vessels/routes/cruise_types/crew/marketing_channels/
// inventory_items/business_parameters/users) — those are seeded once and
// never wiped by --force.
// ---------------------------------------------------------------------------

const FACT_TABLES_DELETE_ORDER = [
  "leads",
  "feedback",
  "complaints",
  "payments",
  "inventory_stock_movements",
  "trip_crew_assignments",
  "events",
  "weather_logs",
  "fuel_logs",
  "expenses",
  "maintenance_records",
  "bookings",
  "campaigns",
  "customers",
  "trips",
];

const YEARLY_PREFIXES_TO_RESET = ["TRP", "BKG", "PAY", "EXP", "MNT", "EVT", "CMP", "LED", "FBK", "CPT"];

function wipeFactTables(db: Database.Database): void {
  // Foreign key pragma toggles cannot happen inside a transaction, and the
  // self-referential customers.referred_by_customer_id FK can otherwise
  // reject a blanket DELETE depending on row order.
  db.pragma("foreign_keys = OFF");
  const wipe = db.transaction(() => {
    for (const table of FACT_TABLES_DELETE_ORDER) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    for (const prefix of YEARLY_PREFIXES_TO_RESET) {
      db.prepare("DELETE FROM id_sequences WHERE sequence_key LIKE ?").run(`${prefix}-%`);
    }
    db.prepare("DELETE FROM id_sequences WHERE sequence_key = ?").run("CUS");
  });
  wipe();
  db.pragma("foreign_keys = ON");
  console.log("[synthetic-seed] wiped 002/003 fact tables (reference tables untouched)");
}

// ---------------------------------------------------------------------------
// Crew + inventory (reference-like; live in schema 001, seeded once, never
// wiped by --force — guarded the same way seedFleetIfEmpty() guards vessels).
// ---------------------------------------------------------------------------

function seedCrewIfEmpty(db: Database.Database, params: Map<string, number>): CrewRec[] {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM crew").get() as { n: number }).n;
  if (count > 0) {
    console.log("[synthetic-seed] crew already seeded, reusing existing roster");
    return db.prepare("SELECT crew_id, full_name, role, monthly_salary_inr FROM crew").all() as CrewRec[];
  }

  const captainSalary = p(params, "captain_salary"); // A18: ₹45,000/mo, licensed captain
  const crewSalary = p(params, "crew_salary"); // A19: ₹18,000/mo per crew
  const shoreSalary = p(params, "ops_staff_cost") / 2; // A20: ₹25,000/mo for 2 FTEs -> ~₹12,500 each

  const roster: Array<{ role: CrewRec["role"]; salaryBase: number; count: number }> = [
    { role: "captain", salaryBase: captainSalary, count: 2 },
    { role: "crew", salaryBase: crewSalary, count: 4 },
    { role: "shore_staff", salaryBase: shoreSalary, count: 2 },
  ];

  const insert = db.prepare(`
    INSERT INTO crew (crew_id, full_name, role, phone, license_number, monthly_salary_inr, joined_date, status, notes)
    VALUES (@crew_id, @full_name, @role, @phone, @license_number, @monthly_salary_inr, @joined_date, 'active', @notes)
  `);

  const result: CrewRec[] = [];
  for (const group of roster) {
    for (let i = 0; i < group.count; i++) {
      const crewId = nextId(db, ID_PREFIX.crew);
      const fullName = randomFullName();
      const salary = round(group.salaryBase * randFloat(0.92, 1.18));
      const joinedDate = dateOnly(addDays(START_DATE, -randInt(60, 500)));
      insert.run({
        crew_id: crewId,
        full_name: fullName,
        role: group.role,
        phone: randomPhone(),
        license_number: group.role === "captain" ? `IND-MC-${randInt(10000, 99999)}` : null,
        monthly_salary_inr: salary,
        joined_date: joinedDate,
        notes:
          group.role === "captain"
            ? "Licensed for commercial passenger vessel operations."
            : group.role === "crew"
              ? "Deck/safety/guest-handling crew."
              : "Shore-side booking & operations staff.",
      });
      result.push({ crew_id: crewId, full_name: fullName, role: group.role, monthly_salary_inr: salary });
    }
  }
  console.log(`[synthetic-seed] crew: ${result.length} rows (2 captain, 4 crew, 2 shore_staff)`);
  return result;
}

const INVENTORY_CATALOG: Array<[string, string, string, number, number, number, string]> = [
  // name, category, unit, reorder_level, reorder_qty, unit_cost_inr, vendor
  ["Bottled Water 500ml", "food_beverage", "bottles", 200, 500, 12, "Udupi Beverages Co"],
  ["Soft Drink Cans", "food_beverage", "cans", 150, 300, 25, "Udupi Beverages Co"],
  ["Coconut Water Cans", "food_beverage", "cans", 100, 200, 35, "Malpe Local Suppliers"],
  ["Masala Chai Sachets", "food_beverage", "packs", 50, 100, 90, "Coastal Foods Traders"],
  ["Filter Coffee Sachets", "food_beverage", "packs", 50, 100, 95, "Coastal Foods Traders"],
  ["Veg Snack Packs", "food_beverage", "packs", 100, 250, 45, "Malpe Catering Supplies"],
  ["Non-Veg Snack Packs", "food_beverage", "packs", 80, 200, 65, "Malpe Catering Supplies"],
  ["Fresh Fruit Packs", "food_beverage", "packs", 60, 150, 40, "Udupi Fresh Produce"],
  ["Welcome Drink Mix", "food_beverage", "liters", 30, 60, 150, "Coastal Foods Traders"],
  ["Biscuit Packs", "food_beverage", "packs", 100, 200, 20, "Malpe Catering Supplies"],
  ["Life Jackets (Adult)", "safety", "pcs", 20, 40, 850, "Coastal Safety Equipment Ltd"],
  ["Life Jackets (Child)", "safety", "pcs", 10, 20, 700, "Coastal Safety Equipment Ltd"],
  ["First Aid Kits", "safety", "kits", 4, 6, 1200, "Coastal Safety Equipment Ltd"],
  ["Fire Extinguishers", "safety", "pcs", 3, 4, 2200, "Coastal Safety Equipment Ltd"],
  ["Life Rings", "safety", "pcs", 4, 6, 1500, "Coastal Safety Equipment Ltd"],
  ["Flare Kits", "safety", "kits", 2, 4, 3200, "Marine Safety Supplies India"],
  ["Emergency Whistles", "safety", "pcs", 20, 30, 60, "Coastal Safety Equipment Ltd"],
  ["Marine Diesel", "fuel", "liters", 200, 1000, 95, "Malpe Port Fuel Depot"],
  ["Engine Oil", "fuel", "liters", 40, 80, 420, "Malpe Port Fuel Depot"],
  ["Lubricant Grease", "fuel", "kg", 10, 20, 380, "Malpe Port Fuel Depot"],
  ["Deck Cleaning Solution", "cleaning", "liters", 20, 40, 180, "Udupi Marine Supplies"],
  ["Disinfectant Spray", "cleaning", "bottles", 15, 30, 150, "Udupi Marine Supplies"],
  ["Trash Bags", "cleaning", "packs", 20, 40, 90, "Udupi Marine Supplies"],
  ["Hand Sanitizer Bottles", "cleaning", "bottles", 20, 40, 85, "Udupi Marine Supplies"],
  ["Souvenir T-Shirts", "merchandise", "pcs", 20, 50, 250, "Coral Adventures Merch"],
  ["Branded Caps", "merchandise", "pcs", 20, 50, 150, "Coral Adventures Merch"],
];

function seedInventoryIfEmpty(db: Database.Database): ItemRec[] {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM inventory_items").get() as { n: number }).n;
  if (count > 0) {
    console.log("[synthetic-seed] inventory_items already seeded, reusing existing catalog");
    return db
      .prepare("SELECT item_id, name, category, reorder_qty, unit_cost_inr FROM inventory_items")
      .all() as ItemRec[];
  }

  const insert = db.prepare(`
    INSERT INTO inventory_items (item_id, name, category, unit, reorder_level, reorder_qty, unit_cost_inr, vendor_name, status)
    VALUES (@item_id, @name, @category, @unit, @reorder_level, @reorder_qty, @unit_cost_inr, @vendor_name, 'active')
  `);

  const result: ItemRec[] = [];
  for (const [name, category, unit, reorderLevel, reorderQty, unitCost, vendor] of INVENTORY_CATALOG) {
    const itemId = nextId(db, ID_PREFIX.item);
    insert.run({
      item_id: itemId,
      name,
      category,
      unit,
      reorder_level: reorderLevel,
      reorder_qty: reorderQty,
      unit_cost_inr: unitCost,
      vendor_name: vendor,
    });
    result.push({ item_id: itemId, name, category, reorder_qty: reorderQty, unit_cost_inr: unitCost });
  }
  console.log(`[synthetic-seed] inventory_items: ${result.length} rows`);
  return result;
}

// ---------------------------------------------------------------------------
// Main historical generation.
// ---------------------------------------------------------------------------

interface CustomerRec {
  id: string;
  channelId: string;
  repeatWeight: number;
}

function generateHistory(
  db: Database.Database,
  params: Map<string, number>,
  channels: ChannelRec[],
  cruiseTypes: CruiseTypeRec[],
  vessel: VesselRec,
  route: RouteRec,
  crew: CrewRec[],
  items: ItemRec[]
): void {
  const standard = cruiseTypes.find((c) => c.name === "Standard")!;
  const premium = cruiseTypes.find((c) => c.name.startsWith("Premium"))!;
  const charter = cruiseTypes.find((c) => c.name === "Charter")!;
  const captains = crew.filter((c) => c.role === "captain");
  const deckCrew = crew.filter((c) => c.role === "crew");

  const groupDiscountRate = p(params, "group_discount_rate"); // A10: 0.1
  const onboardRevPax = p(params, "onboard_rev_pax"); // A12: ₹200/pax
  const fuelCostHr = p(params, "fuel_cost_hr"); // A14: ₹1200/hr
  const tripDurationHrs = route.duration_hrs || p(params, "trip_duration_hrs"); // A03: 2.5hr
  const maintenancePct = p(params, "maintenance_pct"); // A15: 6% p.a. of vessel value
  const varCostPerPax = p(params, "var_cost_per_pax"); // A25: ₹75/pax consumables

  const SEASONALITY = [
    p(params, "seasonality_jan"),
    p(params, "seasonality_feb"),
    p(params, "seasonality_mar"),
    p(params, "seasonality_apr"),
    p(params, "seasonality_may"),
    p(params, "seasonality_jun"),
    p(params, "seasonality_jul"),
    p(params, "seasonality_aug"),
    p(params, "seasonality_sep"),
    p(params, "seasonality_oct"),
    p(params, "seasonality_nov"),
    p(params, "seasonality_dec"),
  ];

  // ---- prepared statements -------------------------------------------------
  const insertTrip = db.prepare(`
    INSERT INTO trips (trip_id, trip_date, vessel_id, route_id, cruise_type_id, slot, scheduled_departure,
      actual_departure, scheduled_return, actual_return, capacity, captain_crew_id, status, cancellation_reason, notes)
    VALUES (@trip_id, @trip_date, @vessel_id, @route_id, @cruise_type_id, @slot, @scheduled_departure,
      @actual_departure, @scheduled_return, @actual_return, @capacity, @captain_crew_id, @status, @cancellation_reason, @notes)
  `);
  const insertCrewAssignment = db.prepare(`
    INSERT INTO trip_crew_assignments (trip_id, crew_id, role_on_trip) VALUES (?, ?, ?)
  `);
  const insertWeather = db.prepare(`
    INSERT INTO weather_logs (trip_id, log_date, condition, wind_speed_kmh, wave_height_m, temperature_c, visibility, notes)
    VALUES (@trip_id, @log_date, @condition, @wind_speed_kmh, @wave_height_m, @temperature_c, @visibility, @notes)
  `);
  const insertCustomer = db.prepare(`
    INSERT INTO customers (customer_id, full_name, phone, email, city, customer_type, acquisition_channel_id, referred_by_customer_id, first_trip_date, notes)
    VALUES (@customer_id, @full_name, @phone, @email, @city, @customer_type, @acquisition_channel_id, @referred_by_customer_id, @first_trip_date, @notes)
  `);
  const insertBooking = db.prepare(`
    INSERT INTO bookings (booking_id, trip_id, customer_id, channel_id, booking_date, passenger_count, cruise_type_id, group_discount_applied, status, booking_source, notes)
    VALUES (@booking_id, @trip_id, @customer_id, @channel_id, @booking_date, @passenger_count, @cruise_type_id, @group_discount_applied, @status, @booking_source, @notes)
  `);
  const insertPayment = db.prepare(`
    INSERT INTO payments (payment_id, booking_id, amount_inr, payment_method, payment_date, payment_type, status)
    VALUES (@payment_id, @booking_id, @amount_inr, @payment_method, @payment_date, @payment_type, 'completed')
  `);
  const insertFuel = db.prepare(`
    INSERT INTO fuel_logs (trip_id, liters_consumed, cost_inr, engine_hours, logged_at)
    VALUES (@trip_id, @liters_consumed, @cost_inr, @engine_hours, @logged_at)
  `);
  const insertExpense = db.prepare(`
    INSERT INTO expenses (expense_id, trip_id, expense_date, category, amount_inr, vendor_name, description, payment_status)
    VALUES (@expense_id, @trip_id, @expense_date, @category, @amount_inr, @vendor_name, @description, 'paid')
  `);
  const insertMaintenance = db.prepare(`
    INSERT INTO maintenance_records (maintenance_id, vessel_id, maintenance_date, type, component, description, cost_inr, downtime_hours, next_due_date, performed_by, status)
    VALUES (@maintenance_id, @vessel_id, @maintenance_date, @type, @component, @description, @cost_inr, @downtime_hours, @next_due_date, @performed_by, 'completed')
  `);
  const insertEvent = db.prepare(`
    INSERT INTO events (event_id, trip_id, event_type, event_date, client_name, contract_value_inr, notes)
    VALUES (@event_id, @trip_id, @event_type, @event_date, @client_name, @contract_value_inr, @notes)
  `);
  const insertStockMovement = db.prepare(`
    INSERT INTO inventory_stock_movements (item_id, trip_id, movement_type, quantity, movement_date, unit_cost_inr, notes)
    VALUES (@item_id, @trip_id, @movement_type, @quantity, @movement_date, @unit_cost_inr, @notes)
  `);
  const insertFeedback = db.prepare(`
    INSERT INTO feedback (feedback_id, trip_id, customer_id, rating_overall, rating_captain, rating_hospitality, rating_value, nps_score, comments, submitted_date)
    VALUES (@feedback_id, @trip_id, @customer_id, @rating_overall, @rating_captain, @rating_hospitality, @rating_value, @nps_score, @comments, @submitted_date)
  `);
  const insertComplaint = db.prepare(`
    INSERT INTO complaints (complaint_id, trip_id, customer_id, category, description, severity, status, resolution_notes, filed_date, resolved_date)
    VALUES (@complaint_id, @trip_id, @customer_id, @category, @description, @severity, @status, @resolution_notes, @filed_date, @resolved_date)
  `);
  const insertCampaign = db.prepare(`
    INSERT INTO campaigns (campaign_id, channel_id, name, start_date, end_date, budget_inr, actual_spend_inr, status)
    VALUES (@campaign_id, @channel_id, @name, @start_date, @end_date, @budget_inr, @actual_spend_inr, @status)
  `);
  const insertLead = db.prepare(`
    INSERT INTO leads (lead_id, channel_id, campaign_id, customer_id, captured_date, contact_info, status, converted_booking_id)
    VALUES (@lead_id, @channel_id, @campaign_id, @customer_id, @captured_date, @contact_info, @status, @converted_booking_id)
  `);

  // ---- customer pool --------------------------------------------------------
  const customerPool: CustomerRec[] = [];
  const customerFirstBookingId = new Map<string, string>();

  function pickOrCreateCustomer(bookingDate: Date): { rec: CustomerRec; isNew: boolean } {
    const poolSize = customerPool.length;
    const reuseProb = poolSize === 0 ? 0 : Math.min(0.72, 0.15 + poolSize / 500);
    if (poolSize > 0 && chance(reuseProb)) {
      const rec = weightedChoice(customerPool, customerPool.map((c) => c.repeatWeight));
      return { rec, isNew: false };
    }

    const channel = weightedChoice(
      channels,
      channels.map((c) => Math.max(c.priority ?? 1, 0.5) * Math.max(c.reach_pct ?? 0.1, 0.01))
    );
    const customerType: "individual" | "corporate" | "agent" = chance(0.85)
      ? "individual"
      : chance(0.6)
        ? "corporate"
        : "agent";
    const fullName = customerType === "individual" ? randomFullName() : choice(CORPORATE_NAMES);

    let referredBy: string | null = null;
    const referralChance = clamp((channel.referral_rate ?? 0) / 6, 0, 0.35);
    if (customerPool.length > 0 && chance(referralChance)) {
      referredBy = choice(customerPool).id;
    }

    const customerId = nextId(db, ID_PREFIX.customer);
    insertCustomer.run({
      customer_id: customerId,
      full_name: fullName,
      phone: randomPhone(),
      email: chance(0.6) ? `${fullName.toLowerCase().replace(/\s+/g, ".")}@example.com` : null,
      city: randomCity(),
      customer_type: customerType,
      acquisition_channel_id: channel.channel_id,
      referred_by_customer_id: referredBy,
      first_trip_date: dateOnly(bookingDate),
      notes: null,
    });

    const rec: CustomerRec = {
      id: customerId,
      channelId: channel.channel_id,
      repeatWeight: 1 + (channel.repeat_rate ?? 0.1) * 8,
    };
    customerPool.push(rec);
    return { rec, isNew: true };
  }

  // ---- occupancy / scheduling helpers ---------------------------------------
  function occupancyFraction(dayIndex: number, season: Season): number {
    const ramp = 0.18 + (dayIndex / TOTAL_DAYS) * 0.35; // business ramping up over the window
    const seasonMult = season === "peak" ? 1.0 : season === "shoulder" ? 0.6 : 0.22;
    return clamp(ramp * seasonMult * randFloat(0.7, 1.3), 0.04, 0.95);
  }
  function slotRunProbability(season: Season, seasonalityIdx: number, isSunday: boolean): number {
    if (season === "off") return clamp(seasonalityIdx * 0.6, 0, 0.35);
    const base = clamp(0.5 + seasonalityIdx * 0.5, 0, 1);
    return isSunday ? base * 0.7 : base;
  }
  function pickCruiseType(season: Season, slot: string): CruiseTypeRec {
    if (season === "off") {
      return chance(0.75) ? charter : chance(0.5) ? standard : premium;
    }
    if (chance(0.035)) return charter;
    if (slot === "evening") return chance(0.55) ? premium : standard;
    return chance(0.12) ? premium : standard;
  }
  function sampleBookingSize(remainingPax: number): number {
    const r = rng();
    let size: number;
    if (r < 0.55) size = randInt(1, 4);
    else if (r < 0.85) size = randInt(5, 9);
    else if (r < 0.96) size = randInt(10, 15);
    else size = randInt(16, 30);
    return Math.max(1, Math.min(size, remainingPax));
  }

  const GOOD_WEATHER = ["Clear Skies", "Sunny", "Partly Cloudy", "Calm Seas", "Light Breeze"];
  const ROUGH_WEATHER = ["Rough Seas", "Heavy Rain", "Thunderstorm Warning", "High Winds", "Monsoon Squall"];
  const BOOKING_SOURCES = ["Website", "Phone", "Walk-in Kiosk", "WhatsApp", "OTA Partner", "Travel Agent"];
  const PAYMENT_METHODS: Array<[string, number]> = [
    ["upi", 0.45],
    ["cash", 0.25],
    ["card", 0.2],
    ["bank_transfer", 0.07],
    ["other", 0.03],
  ];
  function pickPaymentMethod(): string {
    return weightedChoice(
      PAYMENT_METHODS.map((x) => x[0]),
      PAYMENT_METHODS.map((x) => x[1])
    );
  }
  const MAINTENANCE_COMPONENTS = [
    "Main Engine",
    "Hull & Antifouling",
    "Navigation Electronics",
    "Life Jackets & Safety Gear",
    "Fuel System",
    "Electrical Wiring",
    "Anchor Winch",
    "Bilge Pump",
    "Air Conditioning",
    "Steering System",
  ];
  const COMPLAINT_CATEGORIES = [
    "Service Quality",
    "Cleanliness",
    "Safety Concern",
    "Value for Money",
    "Crew Behaviour",
    "Delay",
    "Food Quality",
  ];

  // Running totals used for stock movement pacing.
  let daysSinceRestock = 0;
  const monthlyMaintenanceDone = new Set<string>(); // "YYYY-MM" already scheduled
  const monthsWithSalaryExpense = new Set<string>();

  const consumableItems = items.filter((i) => i.category === "food_beverage" || i.category === "cleaning");
  // Fast-turnover items only: fuel is already expensed per-trip via fuel_logs (see insertFuel below),
  // and safety equipment (life jackets, extinguishers, flares...) is durable — it is not re-bought at
  // full reorder_qty every ~10 days like consumables are. Routine restocking only applies to
  // food/beverage, cleaning, and merchandise.
  const routineRestockItems = items.filter(
    (i) => i.category === "food_beverage" || i.category === "cleaning" || i.category === "merchandise"
  );
  const safetyItems = items.filter((i) => i.category === "safety");
  let daysSinceSafetyRestock = 0;

  // ---- day-by-day generation --------------------------------------------------
  for (let dayIndex = 0; dayIndex < TOTAL_DAYS; dayIndex++) {
    const date = addDays(START_DATE, dayIndex);
    const monthIndex0 = date.getUTCMonth();
    const season = seasonForMonth(monthIndex0);
    const seasonalityIdx = SEASONALITY[monthIndex0];
    const isSunday = date.getUTCDay() === 0;
    const monthKey = `${date.getUTCFullYear()}-${String(monthIndex0 + 1).padStart(2, "0")}`;

    // --- monthly recurring expenses (salary, insurance, port fees) ---
    if (!monthsWithSalaryExpense.has(monthKey) && date.getUTCDate() === 1) {
      monthsWithSalaryExpense.add(monthKey);
      for (const member of crew) {
        insertExpense.run({
          expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
          trip_id: null,
          expense_date: dateOnly(date),
          category: "salary",
          amount_inr: member.monthly_salary_inr,
          vendor_name: member.full_name,
          description: `Monthly salary — ${member.role} (${monthKey})`,
          import_batch_id: null,
        });
      }
      insertExpense.run({
        expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
        trip_id: null,
        expense_date: dateOnly(date),
        category: "insurance",
        amount_inr: round(p(params, "annual_insurance") / 12),
        vendor_name: "Coastal Marine Insurance Co",
        description: `Monthly insurance premium (${monthKey})`,
        import_batch_id: null,
      });
      insertExpense.run({
        expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
        trip_id: null,
        expense_date: dateOnly(date),
        category: "port_fees",
        amount_inr: round(p(params, "port_fees_annual") / 12),
        vendor_name: "Malpe Port Authority",
        description: `Monthly jetty/port access fee (${monthKey})`,
        import_batch_id: null,
      });
      if (chance(0.5)) {
        insertExpense.run({
          expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
          trip_id: null,
          expense_date: dateOnly(date),
          category: "other",
          amount_inr: randInt(2000, 12000),
          vendor_name: choice(["Udupi Municipal Office", "Office Supplies Depot", "Karnataka Tourism Dept"]),
          description: "Licenses, permits & misc admin costs",
          import_batch_id: null,
        });
      }
    }

    // --- scheduled maintenance: roughly once a month ---
    if (!monthlyMaintenanceDone.has(monthKey) && date.getUTCDate() === randInt(8, 15)) {
      monthlyMaintenanceDone.add(monthKey);
      const annualMaintenanceBudget = vessel.book_value_inr * maintenancePct;
      const cost = round((annualMaintenanceBudget / 12) * randFloat(0.6, 1.6));
      const maintId = nextId(db, ID_PREFIX.maintenance, { yearly: true, year: date.getUTCFullYear() });
      insertMaintenance.run({
        maintenance_id: maintId,
        vessel_id: vessel.vessel_id,
        maintenance_date: dateOnly(date),
        type: "scheduled",
        component: choice(MAINTENANCE_COMPONENTS),
        description: "Routine scheduled maintenance & inspection",
        cost_inr: cost,
        downtime_hours: randFloat(2, 8),
        next_due_date: dateOnly(addDays(date, 30)),
        performed_by: chance(0.5) ? choice(deckCrew).full_name : "External Marine Service Contractor",
      });
      insertExpense.run({
        expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
        trip_id: null,
        expense_date: dateOnly(date),
        category: "maintenance",
        amount_inr: cost,
        vendor_name: "Malpe Marine Service Contractor",
        description: `Scheduled maintenance ${maintId}`,
        import_batch_id: null,
      });
      if (chance(0.3)) {
        const predCost = round(cost * randFloat(0.2, 0.6));
        insertMaintenance.run({
          maintenance_id: nextId(db, ID_PREFIX.maintenance, { yearly: true, year: date.getUTCFullYear() }),
          vessel_id: vessel.vessel_id,
          maintenance_date: dateOnly(addDays(date, randInt(2, 10))),
          type: "predictive",
          component: choice(MAINTENANCE_COMPONENTS),
          description: "Predictive maintenance flagged by engine-hours/sensor trend",
          cost_inr: predCost,
          downtime_hours: randFloat(1, 4),
          next_due_date: dateOnly(addDays(date, 60)),
          performed_by: "External Marine Service Contractor",
        });
        insertExpense.run({
          expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
          trip_id: null,
          expense_date: dateOnly(date),
          category: "maintenance",
          amount_inr: predCost,
          vendor_name: "Malpe Marine Service Contractor",
          description: "Predictive maintenance",
          import_batch_id: null,
        });
      }
    }

    // --- inventory restocks: roughly every 9-11 days, fast-turnover items only ---
    // Purchasing scales with actual season demand — a business does not buy full
    // peak-season quantities of food/beverage/merchandise during the monsoon lull.
    const restockSeasonMult = season === "peak" ? 1.0 : season === "shoulder" ? 0.6 : 0.25;
    daysSinceRestock++;
    if (daysSinceRestock >= randInt(9, 12)) {
      daysSinceRestock = 0;
      for (const item of routineRestockItems) {
        if (!chance(0.7)) continue;
        const qty = Math.max(1, round(item.reorder_qty * restockSeasonMult * randFloat(0.8, 1.2)));
        const cost = qty * item.unit_cost_inr;
        insertStockMovement.run({
          item_id: item.item_id,
          trip_id: null,
          movement_type: "restock",
          quantity: qty,
          movement_date: dateOnly(date),
          unit_cost_inr: item.unit_cost_inr,
          notes: `Routine restock — ${item.name}`,
        });
        insertExpense.run({
          expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
          trip_id: null,
          expense_date: dateOnly(date),
          category: "inventory",
          amount_inr: cost,
          vendor_name: "Inventory Restock",
          description: `Restock: ${item.name} x${qty}`,
          import_batch_id: null,
        });
      }
      // occasional shrinkage/waste
      if (chance(0.4)) {
        const item = choice(consumableItems);
        insertStockMovement.run({
          item_id: item.item_id,
          trip_id: null,
          movement_type: chance(0.5) ? "waste" : "shrinkage",
          quantity: randInt(2, 15),
          movement_date: dateOnly(date),
          unit_cost_inr: item.unit_cost_inr,
          notes: "Routine stock reconciliation variance",
        });
      }
    }

    // --- safety equipment replenishment: durable compliance gear, replaced/topped up
    // only a few times a year (expiry, damage, inspection failure) — not a routine restock ---
    daysSinceSafetyRestock++;
    if (daysSinceSafetyRestock >= randInt(150, 240)) {
      daysSinceSafetyRestock = 0;
      for (const item of safetyItems) {
        if (!chance(0.6)) continue;
        const qty = Math.max(1, round(item.reorder_qty * randFloat(0.15, 0.35)));
        const cost = qty * item.unit_cost_inr;
        insertStockMovement.run({
          item_id: item.item_id,
          trip_id: null,
          movement_type: "restock",
          quantity: qty,
          movement_date: dateOnly(date),
          unit_cost_inr: item.unit_cost_inr,
          notes: `Safety equipment replenishment — ${item.name}`,
        });
        insertExpense.run({
          expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
          trip_id: null,
          expense_date: dateOnly(date),
          category: "inventory",
          amount_inr: cost,
          vendor_name: "Safety Equipment Supplier",
          description: `Safety replenishment: ${item.name} x${qty}`,
          import_batch_id: null,
        });
      }
    }

    // --- trips for this day ---
    const slots: Array<"morning" | "afternoon" | "evening"> = ["morning", "afternoon", "evening"];
    for (const slot of slots) {
      if (!chance(slotRunProbability(season, seasonalityIdx, isSunday))) continue;

      const cruiseType = pickCruiseType(season, slot);
      const isCharter = cruiseType.cruise_type_id === charter.cruise_type_id;

      const departHour = slot === "morning" ? 8 : slot === "afternoon" ? 12 : 16;
      const scheduledDeparture = atHour(date, departHour);
      const scheduledReturn = new Date(scheduledDeparture.getTime() + tripDurationHrs * 3600 * 1000);

      // weather
      const roughChance = season === "off" ? 0.55 : 0.06;
      const isRough = chance(roughChance);
      const condition = isRough ? choice(ROUGH_WEATHER) : choice(GOOD_WEATHER);
      const cancelled = isRough && chance(0.55);

      const tripId = nextId(db, ID_PREFIX.trip, { yearly: true, year: date.getUTCFullYear() });
      const captain = choice(captains);

      const delayMin = cancelled ? 0 : randInt(0, 20);
      const actualDeparture = cancelled ? null : timestamp(new Date(scheduledDeparture.getTime() + delayMin * 60000));
      const actualReturn = cancelled ? null : timestamp(new Date(scheduledReturn.getTime() + delayMin * 60000));

      insertTrip.run({
        trip_id: tripId,
        trip_date: dateOnly(date),
        vessel_id: vessel.vessel_id,
        route_id: route.route_id,
        cruise_type_id: cruiseType.cruise_type_id,
        slot,
        scheduled_departure: timestamp(scheduledDeparture),
        actual_departure: actualDeparture,
        scheduled_return: timestamp(scheduledReturn),
        actual_return: actualReturn,
        capacity: vessel.capacity,
        captain_crew_id: captain.crew_id,
        status: cancelled ? "cancelled" : "completed",
        cancellation_reason: cancelled ? `Weather: ${condition} — unsafe for passenger operations` : null,
        notes: isCharter && !cancelled ? "Private charter booking." : null,
      });

      insertCrewAssignment.run(tripId, captain.crew_id, "captain");
      const assignedDeck = new Set<string>();
      const deckCount = Math.min(2, deckCrew.length);
      while (assignedDeck.size < deckCount) {
        assignedDeck.add(choice(deckCrew).crew_id);
      }
      for (const crewId of assignedDeck) {
        insertCrewAssignment.run(tripId, crewId, "deckhand");
      }

      insertWeather.run({
        trip_id: tripId,
        log_date: dateOnly(date),
        condition,
        wind_speed_kmh: isRough ? randFloat(35, 65) : randFloat(5, 25),
        wave_height_m: isRough ? randFloat(1.5, 3.5) : randFloat(0.2, 1.0),
        temperature_c: randFloat(24, 34),
        visibility: isRough ? choice(["Poor", "Moderate"]) : "Good",
        notes: isRough ? "Elevated sea state logged prior to departure decision." : null,
      });

      if (cancelled) {
        if (chance(0.3)) {
          const cost = randInt(5000, 40000);
          insertMaintenance.run({
            maintenance_id: nextId(db, ID_PREFIX.maintenance, { yearly: true, year: date.getUTCFullYear() }),
            vessel_id: vessel.vessel_id,
            maintenance_date: dateOnly(date),
            type: "emergency",
            component: choice(MAINTENANCE_COMPONENTS),
            description: "Emergency inspection following rough-weather standby",
            cost_inr: cost,
            downtime_hours: randFloat(2, 12),
            next_due_date: null,
            performed_by: "External Marine Service Contractor",
          });
          insertExpense.run({
            expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
            trip_id: tripId,
            expense_date: dateOnly(date),
            category: "maintenance",
            amount_inr: cost,
            vendor_name: "Malpe Marine Service Contractor",
            description: "Emergency inspection (weather standby)",
            import_batch_id: null,
          });
        }
        continue; // no bookings/fuel/revenue for cancelled trips
      }

      // --- fuel ---
      const engineHours = tripDurationHrs * randFloat(0.9, 1.1);
      const fuelCost = round(fuelCostHr * engineHours * randFloat(0.85, 1.15));
      insertFuel.run({
        trip_id: tripId,
        liters_consumed: round((fuelCost / 95) * 10) / 10,
        cost_inr: fuelCost,
        engine_hours: Math.round(engineHours * 10) / 10,
        logged_at: timestamp(scheduledReturn),
      });
      insertExpense.run({
        expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
        trip_id: tripId,
        expense_date: dateOnly(date),
        category: "fuel",
        amount_inr: fuelCost,
        vendor_name: "Malpe Port Fuel Depot",
        description: "Trip fuel consumption",
        import_batch_id: null,
      });

      // --- bookings & payments ---
      const tripBookings: Array<{ bookingId: string; customerId: string; passengerCount: number }> = [];

      if (isCharter) {
        const eventTypes: Array<[string, [number, number]]> = [
          ["wedding", [30, 100]],
          ["corporate", [18, 45]],
          ["birthday", [10, 40]],
          ["other", [15, 60]],
        ];
        const [eventType, [minPax, maxPax]] = choice(eventTypes);
        const passengers = Math.min(vessel.capacity, randInt(minPax, maxPax));
        const bookingDate = addDays(date, -randInt(3, 45));
        const { rec: customer, isNew } = pickOrCreateCustomer(bookingDate);

        const bookingId = nextId(db, ID_PREFIX.booking, { yearly: true, year: bookingDate.getUTCFullYear() });
        insertBooking.run({
          booking_id: bookingId,
          trip_id: tripId,
          customer_id: customer.id,
          channel_id: customer.channelId,
          booking_date: dateOnly(bookingDate),
          passenger_count: passengers,
          cruise_type_id: cruiseType.cruise_type_id,
          group_discount_applied: 0,
          status: "completed",
          booking_source: "Direct — Charter Enquiry",
          notes: `${eventType} charter`,
        });
        if (isNew) customerFirstBookingId.set(customer.id, bookingId);
        tripBookings.push({ bookingId, customerId: customer.id, passengerCount: passengers });

        const charterAmount = round(charter.base_price_inr * randFloat(0.95, 1.5));
        insertPayment.run({
          payment_id: nextId(db, ID_PREFIX.payment, { yearly: true, year: bookingDate.getUTCFullYear() }),
          booking_id: bookingId,
          amount_inr: charterAmount,
          payment_method: pickPaymentMethod(),
          payment_date: dateOnly(bookingDate),
          payment_type: "charter",
        });
        if (chance(0.4)) {
          const onboardAmt = round(passengers * onboardRevPax * randFloat(0.8, 1.8));
          insertPayment.run({
            payment_id: nextId(db, ID_PREFIX.payment, { yearly: true, year: date.getUTCFullYear() }),
            booking_id: bookingId,
            amount_inr: onboardAmt,
            payment_method: pickPaymentMethod(),
            payment_date: dateOnly(date),
            payment_type: "onboard",
          });
        }

        insertEvent.run({
          event_id: nextId(db, ID_PREFIX.event, { yearly: true, year: date.getUTCFullYear() }),
          trip_id: tripId,
          event_type: eventType,
          event_date: dateOnly(date),
          client_name: eventType === "corporate" ? choice(CORPORATE_NAMES) : randomFullName(),
          contract_value_inr: charterAmount,
          notes: `Full-vessel charter, ${passengers} guests.`,
        });
      } else {
        const occFraction = occupancyFraction(dayIndex, season);
        let remaining = round(vessel.capacity * occFraction);
        let bookingCount = 0;
        while (remaining > 0 && bookingCount < 60) {
          const size = sampleBookingSize(remaining);
          const bookingDate = addDays(date, -randInt(0, 10));
          const clampedBookingDate = bookingDate < START_DATE ? START_DATE : bookingDate;
          const { rec: customer, isNew } = pickOrCreateCustomer(clampedBookingDate);

          const groupDiscount = size >= 10;
          const roll = rng();
          const bookingStatus: "completed" | "no_show" | "cancelled" = roll < 0.92 ? "completed" : roll < 0.96 ? "no_show" : "cancelled";

          const bookingId = nextId(db, ID_PREFIX.booking, { yearly: true, year: clampedBookingDate.getUTCFullYear() });
          insertBooking.run({
            booking_id: bookingId,
            trip_id: tripId,
            customer_id: customer.id,
            channel_id: customer.channelId,
            booking_date: dateOnly(clampedBookingDate),
            passenger_count: size,
            cruise_type_id: cruiseType.cruise_type_id,
            group_discount_applied: groupDiscount ? 1 : 0,
            status: bookingStatus,
            booking_source: choice(BOOKING_SOURCES),
            notes: null,
          });
          if (isNew) customerFirstBookingId.set(customer.id, bookingId);
          tripBookings.push({ bookingId, customerId: customer.id, passengerCount: size });

          const unitPrice = cruiseType.base_price_inr;
          const ticketAmount = round(size * unitPrice * (groupDiscount ? 1 - groupDiscountRate : 1));
          insertPayment.run({
            payment_id: nextId(db, ID_PREFIX.payment, { yearly: true, year: clampedBookingDate.getUTCFullYear() }),
            booking_id: bookingId,
            amount_inr: ticketAmount,
            payment_method: pickPaymentMethod(),
            payment_date: dateOnly(clampedBookingDate),
            payment_type: "ticket",
          });

          if (bookingStatus === "completed" && chance(0.5)) {
            const onboardAmt = round(size * onboardRevPax * randFloat(0.5, 1.5));
            insertPayment.run({
              payment_id: nextId(db, ID_PREFIX.payment, { yearly: true, year: date.getUTCFullYear() }),
              booking_id: bookingId,
              amount_inr: onboardAmt,
              payment_method: pickPaymentMethod(),
              payment_date: dateOnly(date),
              payment_type: "onboard",
            });
          }
          if (bookingStatus === "cancelled") {
            insertPayment.run({
              payment_id: nextId(db, ID_PREFIX.payment, { yearly: true, year: date.getUTCFullYear() }),
              booking_id: bookingId,
              amount_inr: ticketAmount,
              payment_method: pickPaymentMethod(),
              payment_date: dateOnly(date),
              payment_type: "refund",
            });
          }

          remaining -= size;
          bookingCount++;
        }

        // consumable stock consumption proportional to passengers served
        const passengersServed = tripBookings.reduce((sum, b) => sum + b.passengerCount, 0);
        if (passengersServed > 0) {
          for (const item of consumableItems) {
            if (!chance(0.6)) continue;
            insertStockMovement.run({
              item_id: item.item_id,
              trip_id: tripId,
              movement_type: "consumption",
              quantity: round(passengersServed * randFloat(0.4, 1.1)),
              movement_date: dateOnly(date),
              unit_cost_inr: null,
              notes: "Onboard consumption",
            });
          }

          // Per-passenger variable consumables cost (A25: ₹75/pax — safety
          // gear wear, cleaning materials, snacks not captured by the
          // itemized restock/consumption movements above).
          insertExpense.run({
            expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: date.getUTCFullYear() }),
            trip_id: tripId,
            expense_date: dateOnly(date),
            category: "inventory",
            amount_inr: round(passengersServed * varCostPerPax * randFloat(0.85, 1.15)),
            vendor_name: "Onboard Consumables",
            description: "Per-passenger variable consumables cost",
            import_batch_id: null,
          });
        }
      }

      // --- feedback + complaints for completed bookings ---
      for (const b of tripBookings) {
        if (!chance(0.3)) continue;
        const ratingRoll = rng();
        const ratingOverall = ratingRoll < 0.4 ? 5 : ratingRoll < 0.75 ? 4 : ratingRoll < 0.9 ? 3 : ratingRoll < 0.97 ? 2 : 1;
        const npsRoll = rng();
        const nps = npsRoll < 0.45 ? randInt(9, 10) : npsRoll < 0.8 ? randInt(7, 8) : randInt(0, 6);
        const submittedDate = addDays(date, randInt(0, 5));
        const feedbackId = nextId(db, ID_PREFIX.feedback, { yearly: true, year: submittedDate.getUTCFullYear() });
        insertFeedback.run({
          feedback_id: feedbackId,
          trip_id: tripId,
          customer_id: b.customerId,
          rating_overall: ratingOverall,
          rating_captain: clamp(ratingOverall + randInt(-1, 1), 1, 5),
          rating_hospitality: clamp(ratingOverall + randInt(-1, 1), 1, 5),
          rating_value: clamp(ratingOverall + randInt(-1, 1), 1, 5),
          nps_score: nps,
          comments:
            ratingOverall >= 4
              ? choice(["Amazing sunset views!", "Crew was very friendly.", "Great value for money.", "Would book again."])
              : ratingOverall <= 2
                ? choice(["Boarding was delayed.", "Food options were limited.", "Vessel felt crowded.", "Not worth the price."])
                : "Decent experience overall.",
          submitted_date: dateOnly(submittedDate),
        });

        if (ratingOverall <= 2 && chance(0.8)) {
          const filedDate = addDays(submittedDate, randInt(0, 2));
          const isOld = (END_DATE.getTime() - filedDate.getTime()) / 86400000 > 30;
          insertComplaint.run({
            complaint_id: nextId(db, ID_PREFIX.complaint, { yearly: true, year: filedDate.getUTCFullYear() }),
            trip_id: tripId,
            customer_id: b.customerId,
            category: choice(COMPLAINT_CATEGORIES),
            description: "Guest reported dissatisfaction in post-trip feedback survey.",
            severity: chance(0.15) ? "high" : chance(0.5) ? "medium" : "low",
            status: isOld ? "resolved" : chance(0.5) ? "investigating" : "open",
            resolution_notes: isOld ? "Followed up with guest; goodwill discount offered for next trip." : null,
            filed_date: dateOnly(filedDate),
            resolved_date: isOld ? dateOnly(addDays(filedDate, randInt(2, 10))) : null,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Marketing: campaigns + leads per channel, sized off each channel's own
  // acquisition volume in the pool above (not the raw market-size figures,
  // which are aspirational multi-lakh audiences far beyond what a single
  // 160-pax vessel could ever convert — see synthetic-seed assumptions
  // note at the bottom of this file / final report).
  // ---------------------------------------------------------------------
  const customersByChannel = new Map<string, CustomerRec[]>();
  for (const c of customerPool) {
    const list = customersByChannel.get(c.channelId) ?? [];
    list.push(c);
    customersByChannel.set(c.channelId, list);
  }

  // All bookings by customer (for lead conversion linkage), first booking id only.
  for (const channel of channels) {
    const converted = customersByChannel.get(channel.channel_id) ?? [];
    if (converted.length === 0 && !chance(0.3)) continue; // skip near-zero channels most of the time

    const numCampaigns = randInt(1, 3);
    const campaignIds: string[] = [];
    for (let i = 0; i < numCampaigns; i++) {
      const startOffset = randInt(0, TOTAL_DAYS - 14);
      const campaignStart = addDays(START_DATE, startOffset);
      const durationDays = randInt(20, 120);
      const campaignEnd = addDays(campaignStart, Math.min(durationDays, TOTAL_DAYS - startOffset - 1));
      const annualSpend = channel.planned_annual_spend_inr ?? 24000;
      const budget = round((annualSpend / 365) * durationDays * randFloat(0.8, 1.2));
      const spend = round(budget * randFloat(0.75, 1.05));
      const campaignId = nextId(db, ID_PREFIX.campaign, { yearly: true, year: campaignStart.getUTCFullYear() });
      const isRecent = (END_DATE.getTime() - campaignEnd.getTime()) / 86400000 < 14;
      insertCampaign.run({
        campaign_id: campaignId,
        channel_id: channel.channel_id,
        name: `${channel.name} — Phase ${i + 1}`,
        start_date: dateOnly(campaignStart),
        end_date: dateOnly(campaignEnd),
        budget_inr: budget,
        actual_spend_inr: spend,
        status: isRecent ? "active" : "completed",
      });
      campaignIds.push(campaignId);

      // Split the campaign spend into monthly marketing-expense ledger lines
      // rather than one lump sum, so expense trends look realistic month to month.
      let cursor = campaignStart;
      const monthsInCampaign = Math.max(1, Math.round(durationDays / 30));
      const perMonthSpend = round(spend / monthsInCampaign);
      for (let m = 0; m < monthsInCampaign; m++) {
        if (cursor > campaignEnd || cursor > END_DATE) break;
        insertExpense.run({
          expense_id: nextId(db, ID_PREFIX.expense, { yearly: true, year: cursor.getUTCFullYear() }),
          trip_id: null,
          expense_date: dateOnly(cursor),
          category: "marketing",
          amount_inr: perMonthSpend,
          vendor_name: channel.name,
          description: `Marketing spend — ${channel.name} (${campaignId})`,
          import_batch_id: null,
        });
        cursor = addDays(cursor, 30);
      }
    }

    const conversionRate = Math.max(channel.conversion_rate ?? 0.1, 0.05);
    const totalLeads = converted.length > 0 ? round(converted.length / conversionRate) : randInt(0, 5);

    const convertedSet = [...converted];
    for (let i = 0; i < totalLeads; i++) {
      const dayOffset = randInt(0, TOTAL_DAYS - 1);
      const capturedDate = addDays(START_DATE, dayOffset);
      const seasonalWeight = SEASONALITY[capturedDate.getUTCMonth()] * (channel.seasonality_index ?? 0.7);
      if (!chance(clamp(seasonalWeight, 0.1, 1))) continue;

      const isConverted = convertedSet.length > 0 && chance(converted.length / Math.max(totalLeads, 1));
      const customer = isConverted ? convertedSet.pop()! : null;
      const status: "new" | "contacted" | "qualified" | "converted" | "lost" = customer
        ? "converted"
        : chance(0.6)
          ? "lost"
          : chance(0.5)
            ? "qualified"
            : "contacted";

      insertLead.run({
        lead_id: nextId(db, ID_PREFIX.lead, { yearly: true, year: capturedDate.getUTCFullYear() }),
        channel_id: channel.channel_id,
        campaign_id: campaignIds.length > 0 ? choice(campaignIds) : null,
        customer_id: customer ? customer.id : null,
        captured_date: dateOnly(capturedDate),
        contact_info: `lead-${randInt(100000, 999999)}@example.com`,
        status,
        converted_booking_id: customer ? customerFirstBookingId.get(customer.id) ?? null : null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function syntheticSeed(): void {
  seed(); // ensures migrations + reference data (business_parameters, marketing_channels, fleet) exist
  const db = getDb();
  const force = process.argv.includes("--force");

  const tripCount = (db.prepare("SELECT COUNT(*) AS n FROM trips").get() as { n: number }).n;
  if (tripCount > 0 && !force) {
    console.log(
      `[synthetic-seed] trips table already has ${tripCount} rows — skipping (pass --force to wipe and regenerate).`
    );
    return;
  }

  if (force && tripCount > 0) {
    wipeFactTables(db);
  }

  const params = loadParams(db);
  const channels = db
    .prepare(
      `SELECT channel_id, name, category, reach_pct, priority, conversion_rate, referral_rate, repeat_rate,
              seasonality_index, planned_annual_spend_inr
       FROM marketing_channels WHERE is_active = 1`
    )
    .all() as ChannelRec[];
  const cruiseTypes = db.prepare("SELECT cruise_type_id, name, base_price_inr FROM cruise_types").all() as CruiseTypeRec[];
  const vessel = db.prepare("SELECT vessel_id, capacity, book_value_inr FROM vessels LIMIT 1").get() as
    | VesselRec
    | undefined;
  const route = db.prepare("SELECT route_id, duration_hrs FROM routes LIMIT 1").get() as RouteRec | undefined;

  if (!vessel || !route || cruiseTypes.length === 0 || channels.length === 0) {
    throw new Error("synthetic-seed: reference data (vessel/route/cruise_types/marketing_channels) missing after seed()");
  }

  const run = db.transaction(() => {
    const crew = seedCrewIfEmpty(db, params);
    const items = seedInventoryIfEmpty(db);
    generateHistory(db, params, channels, cruiseTypes, vessel, route, crew, items);
  });
  run();

  console.log(`[synthetic-seed] generated ~${TOTAL_DAYS} days of history (${dateOnly(START_DATE)} .. ${dateOnly(END_DATE)}).`);
}

if (require.main === module) {
  syntheticSeed();
  console.log("[synthetic-seed] done.");
}
