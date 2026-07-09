// Enum value lists mirrored from the CHECK constraints in src/server/db/schema/*.sql.
// Hardcoded here deliberately (per project instructions) since these values are
// stable schema constraints, not runtime configuration — querying the DB for
// them on every template generation would be pointless indirection.
//
// IMPORTANT: if a CHECK constraint in the schema changes, update the matching
// list below in the same commit.

/** payments.payment_method */
export const PAYMENT_METHODS = ["cash", "upi", "card", "bank_transfer", "other"] as const;

/** payments.payment_type */
export const PAYMENT_TYPES = ["ticket", "onboard", "charter", "refund"] as const;

/** payments.status */
export const PAYMENT_STATUSES = ["completed", "pending", "failed"] as const;

/** expenses.category */
export const EXPENSE_CATEGORIES = [
  "fuel",
  "maintenance",
  "salary",
  "insurance",
  "port_fees",
  "marketing",
  "inventory",
  "other",
] as const;

/** expenses.payment_status */
export const EXPENSE_PAYMENT_STATUSES = ["paid", "pending"] as const;

/** maintenance_records.type */
export const MAINTENANCE_TYPES = ["scheduled", "predictive", "emergency"] as const;

/** maintenance_records.status */
export const MAINTENANCE_STATUSES = ["scheduled", "in_progress", "completed"] as const;

/**
 * inventory_stock_movements.movement_type — full DB-level list.
 * The Inventory workbook intentionally only offers the non-consumption subset
 * (see MOVEMENT_TYPES_INVENTORY_WORKBOOK) because trip-level consumption is
 * captured on the Hospitality workbook instead — see templates/sheetSpecs.ts
 * for the reasoning.
 */
export const MOVEMENT_TYPES_ALL = ["restock", "consumption", "waste", "shrinkage"] as const;
export const MOVEMENT_TYPES_INVENTORY_WORKBOOK = ["restock", "waste", "shrinkage"] as const;

/** customers.customer_type */
export const CUSTOMER_TYPES = ["individual", "corporate", "agent"] as const;

/** bookings.status */
export const BOOKING_STATUSES = ["confirmed", "cancelled", "no_show", "completed"] as const;

/** trips.status — the Captain workbook only ever reports a completed trip's outcome. */
export const TRIP_OUTCOME_STATUSES = ["completed", "cancelled"] as const;

/**
 * weather_logs.condition / visibility are free TEXT columns (no CHECK
 * constraint) — these lists exist purely for a friendly Excel dropdown and
 * are NOT enforced as hard validation errors on import (an unrecognized
 * value is accepted, just flagged as a low-severity warning).
 */
export const WEATHER_CONDITIONS = ["clear", "partly_cloudy", "cloudy", "rainy", "stormy", "windy"] as const;
export const VISIBILITY_LEVELS = ["good", "moderate", "poor"] as const;

/** complaints.severity */
export const COMPLAINT_SEVERITIES = ["low", "medium", "high", "critical"] as const;

/** complaints.status */
export const COMPLAINT_STATUSES = ["open", "investigating", "resolved"] as const;

/** leads.status */
export const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"] as const;

/** Generic Yes/No pair used for boolean-ish columns (e.g. group_discount_applied). */
export const YES_NO = ["Yes", "No"] as const;

export const CANCELLATION_REASONS = ["weather", "customer_request", "technical_issue", "staffing", "other"] as const;

export const PHOTO_ZONES = ["deck", "cabin", "dining", "lounge", "exterior", "other"] as const;

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
