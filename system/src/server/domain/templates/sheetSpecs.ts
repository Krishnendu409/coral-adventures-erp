// Single source of truth for the structure of every generated workbook.
// Both the template generator (templateBuilder.ts) and the import parser
// (server/domain/import/parse.ts) read these specs so the "what we ask staff
// to fill in" and "what we validate/import" never drift apart.
import * as E from "./enums";

export type ColumnType =
  | "text"
  | "integer"
  | "number"
  | "inr"
  | "date"
  | "datetime"
  | "enum"
  | "lookup"
  | "booking_ref";

export type LookupTable = "marketing_channels" | "cruise_types" | "inventory_items";

export interface ColumnSpec {
  /** Machine key used when parsing a row into a plain object. */
  key: string;
  /** Column header shown in Excel. A " *" suffix is appended automatically when required. */
  header: string;
  type: ColumnType;
  required: boolean;
  /** Static dropdown values — used for type "enum". */
  enumValues?: readonly string[];
  /** Whether an unrecognized enum value is a hard error (default) or just a warning (weather/visibility). */
  enumStrict?: boolean;
  /** DB table to resolve a "lookup" column's text value against (by name, case-insensitive). */
  lookup?: LookupTable;
  width?: number;
  /** Pre-filled default shown to the user is out of scope; this is the value assumed when the cell is left blank. */
  default?: string | number;
  note?: string;
}

export interface SheetSpec {
  /** Excel sheet (tab) name. */
  name: string;
  columns: ColumnSpec[];
  /** How many blank input rows to pre-provision for staff to fill. */
  emptyRows: number;
  /** True for sheets that must contain exactly one data row (e.g. the Captain's trip log). */
  singleRow?: boolean;
  /** Adds a leading, locked, auto-numbering "#" column so other workbooks can reference a row as "Booking # 3" etc. */
  autoNumberColumn?: boolean;
  /** Column label used for the auto-number column, e.g. "Booking #". */
  autoNumberLabel?: string;
}

export type TemplateType =
  | "reservations"
  | "captain"
  | "finance"
  | "hospitality"
  | "maintenance"
  | "inventory"
  | "feedback"
  | "marketing";

export interface WorkbookSpec {
  type: TemplateType;
  fileName: string;
  title: string;
  description: string;
  sheets: SheetSpec[];
}

export const WORKBOOK_ORDER: TemplateType[] = [
  "reservations",
  "captain",
  "finance",
  "hospitality",
  "maintenance",
  "inventory",
  "feedback",
  "marketing",
];

/**
 * Design decision (not fully specified by the brief): which workbooks are
 * mandatory per trip. Every trip that actually sailed needs the Captain
 * workbook (proof it happened + fuel/weather facts) and the Finance workbook
 * (bookings/payments/expenses — revenue truth). Hospitality, Maintenance,
 * Inventory, Feedback and Marketing may legitimately have nothing to report
 * for a given trip (no onboard sales, no maintenance done, no feedback
 * collected, no leads that day) so they are optional: if the file is absent
 * the import simply skips that data source; if present, it is validated like
 * any other workbook.
 */
export const MANDATORY_WORKBOOKS: TemplateType[] = ["captain", "finance"];

export const WORKBOOK_SPECS: Record<TemplateType, WorkbookSpec> = {
  reservations: {
    type: "reservations",
    fileName: "Reservations.xlsx",
    title: "Reservations Workbook",
    description: "Pre-bookings, ticketing payments, and cancellations.",
    sheets: [
      {
        name: "Bookings",
        emptyRows: 20,
        autoNumberColumn: true,
        autoNumberLabel: "Booking #",
        columns: [
          { key: "customer_full_name", header: "Customer Full Name", type: "text", required: true, width: 24 },
          { key: "phone", header: "Phone", type: "text", required: true, width: 16 },
          { key: "email", header: "Email", type: "text", required: false, width: 24 },
          { key: "city", header: "City", type: "text", required: false, width: 16 },
          { key: "customer_type", header: "Customer Type", type: "enum", required: false, enumValues: E.CUSTOMER_TYPES, default: "individual" },
          { key: "acquisition_channel", header: "Acquisition Channel", type: "lookup", lookup: "marketing_channels", required: false, width: 26 },
          { key: "booking_date", header: "Booking Date", type: "date", required: true },
          { key: "passenger_count", header: "Passenger Count", type: "integer", required: true },
          { key: "cruise_type", header: "Cruise Type", type: "lookup", lookup: "cruise_types", required: true, width: 20 },
          { key: "lead_time_days", header: "Lead Time (Days)", type: "integer", required: false },
          { key: "group_discount_applied", header: "Group Discount Applied", type: "enum", required: false, enumValues: E.YES_NO, default: "No" },
          { key: "status", header: "Status", type: "enum", required: false, enumValues: E.BOOKING_STATUSES, default: "confirmed" },
          { key: "booking_source", header: "Booking Source", type: "text", required: false },
          { key: "notes", header: "Notes", type: "text", required: false, width: 30 },
        ],
      },
      {
        name: "Payments",
        emptyRows: 20,
        columns: [
          { key: "booking_ref", header: "Booking # (from Bookings sheet)", type: "booking_ref", required: true, width: 24 },
          { key: "amount_inr", header: "Amount (INR)", type: "inr", required: true },
          { key: "payment_method", header: "Payment Method", type: "enum", required: true, enumValues: E.PAYMENT_METHODS },
          { key: "payment_date", header: "Payment Date", type: "date", required: true },
          { key: "payment_type", header: "Payment Type", type: "enum", required: true, enumValues: E.PAYMENT_TYPES },
          { key: "status", header: "Status", type: "enum", required: false, enumValues: E.PAYMENT_STATUSES, default: "completed" },
        ],
      },
      {
        name: "Cancellations",
        emptyRows: 10,
        columns: [
          { key: "booking_ref", header: "Booking #", type: "booking_ref", required: true, width: 24 },
          { key: "cancellation_reason", header: "Cancellation Reason", type: "enum", required: true, enumValues: E.CANCELLATION_REASONS },
          { key: "days_before_departure", header: "Days Before Departure", type: "integer", required: true },
          { key: "refund_amount_inr", header: "Refund Amount (INR)", type: "inr", required: false },
        ]
      }
    ],
  },

  captain: {
    type: "captain",
    fileName: "Captain.xlsx",
    title: "Captain Workbook",
    description: "Actual sailing times, weather conditions, and fuel/engine log for this trip.",
    sheets: [
      {
        name: "Trip Log",
        singleRow: true,
        emptyRows: 1,
        columns: [
          { key: "actual_departure", header: "Actual Departure", type: "datetime", required: true },
          { key: "actual_return", header: "Actual Return", type: "datetime", required: true },
          { key: "turnaround_time_mins", header: "Turnaround Time (Mins)", type: "integer", required: false },
          { key: "transition_time_mins", header: "Transition Time (Mins)", type: "integer", required: false },
          { key: "safety_incidents", header: "Safety Incidents Count", type: "integer", required: true, default: 0 },
          {
            key: "status",
            header: "Trip Status",
            type: "enum",
            required: true,
            enumValues: E.TRIP_OUTCOME_STATUSES,
          },
          { key: "cancellation_reason", header: "Cancellation Reason (if cancelled)", type: "text", required: false },
          {
            key: "weather_condition",
            header: "Weather Condition",
            type: "enum",
            required: true,
            enumValues: E.WEATHER_CONDITIONS,
            enumStrict: false,
          },
          { key: "wind_speed_kmh", header: "Wind Speed (km/h)", type: "number", required: false },
          { key: "wave_height_m", header: "Wave Height (m)", type: "number", required: false },
          { key: "temperature_c", header: "Temperature (C)", type: "number", required: false },
          {
            key: "visibility",
            header: "Visibility",
            type: "enum",
            required: false,
            enumValues: E.VISIBILITY_LEVELS,
            enumStrict: false,
          },
          { key: "liters_consumed", header: "Fuel Consumed (Liters)", type: "number", required: true },
          { key: "fuel_cost_inr", header: "Fuel Cost (INR)", type: "inr", required: true },
          { key: "engine_hours", header: "Engine Hours", type: "number", required: true },
          { key: "notes", header: "Notes", type: "text", required: false, width: 40 },
        ],
      },
      {
        name: "Safety Incidents",
        emptyRows: 5,
        columns: [
          { key: "incident_type", header: "Incident Type", type: "text", required: true },
          { key: "severity", header: "Severity", type: "enum", required: true, enumValues: E.INCIDENT_SEVERITIES },
          { key: "description", header: "Description", type: "text", required: true, width: 40 }
        ]
      }
    ],
  },

  finance: {
    type: "finance",
    fileName: "Finance.xlsx",
    title: "Finance Workbook",
    description: "Onboard cash collection, bank deposits, and expenses for this trip.",
    sheets: [
      {
        name: "Expenses",
        emptyRows: 15,
        columns: [
          { key: "expense_date", header: "Expense Date", type: "date", required: true },
          { key: "category", header: "Category", type: "enum", required: true, enumValues: E.EXPENSE_CATEGORIES },
          { key: "amount_inr", header: "Amount (INR)", type: "inr", required: true },
          { key: "vendor_name", header: "Vendor Name", type: "text", required: false, width: 24 },
          { key: "description", header: "Description", type: "text", required: false, width: 30 },
          {
            key: "payment_status",
            header: "Payment Status",
            type: "enum",
            required: false,
            enumValues: E.EXPENSE_PAYMENT_STATUSES,
            default: "paid",
          },
        ],
      },
    ],
  },

  hospitality: {
    type: "hospitality",
    fileName: "Hospitality.xlsx",
    title: "Hospitality Workbook",
    description: "Onboard sales taken during the trip and inventory consumed onboard.",
    sheets: [
      {
        name: "Onboard Sales",
        emptyRows: 15,
        columns: [
          {
            key: "booking_ref",
            header: "Booking # (from Reservations)",
            type: "booking_ref",
            required: true,
            width: 28,
          },
          { key: "amount_inr", header: "Amount (INR)", type: "inr", required: true },
          {
            key: "payment_method",
            header: "Payment Method",
            type: "enum",
            required: true,
            enumValues: E.PAYMENT_METHODS,
          },
          { key: "payment_date", header: "Payment Date", type: "date", required: true },
          {
            key: "status",
            header: "Status",
            type: "enum",
            required: false,
            enumValues: E.PAYMENT_STATUSES,
            default: "completed",
          },
        ],
      },
      {
        name: "Inventory Consumption",
        emptyRows: 15,
        columns: [
          { key: "item", header: "Item", type: "lookup", lookup: "inventory_items", required: true, width: 24 },
          { key: "quantity", header: "Quantity", type: "number", required: true },
          { key: "movement_date", header: "Movement Date", type: "date", required: true },
          { key: "unit_cost_inr", header: "Unit Cost (INR)", type: "inr", required: false },
          { key: "notes", header: "Notes", type: "text", required: false, width: 30 },
        ],
      },
      {
        name: "Photo Zones",
        emptyRows: 10,
        columns: [
          { key: "zone_name", header: "Photo Zone", type: "enum", required: true, enumValues: E.PHOTO_ZONES },
          { key: "clicks_count", header: "Number of Clicks/Interactions", type: "integer", required: true }
        ]
      },
      {
        name: "Aesthetic Complaints",
        emptyRows: 5,
        columns: [
          { key: "area_description", header: "Area Description", type: "text", required: true },
          { key: "severity", header: "Severity", type: "enum", required: true, enumValues: E.COMPLAINT_SEVERITIES },
          { key: "details", header: "Details", type: "text", required: false, width: 30 }
        ]
      }
    ],
  },

  maintenance: {
    type: "maintenance",
    fileName: "Maintenance.xlsx",
    title: "Maintenance Workbook",
    description: "Maintenance work performed on the vessel around this trip.",
    sheets: [
      {
        name: "Maintenance Records",
        emptyRows: 10,
        columns: [
          { key: "maintenance_date", header: "Maintenance Date", type: "date", required: true },
          { key: "type", header: "Type", type: "enum", required: true, enumValues: E.MAINTENANCE_TYPES },
          { key: "component", header: "Component", type: "text", required: true, width: 22 },
          { key: "description", header: "Description", type: "text", required: false, width: 30 },
          { key: "cost_inr", header: "Cost (INR)", type: "inr", required: false, default: 0 },
          { key: "downtime_hours", header: "Downtime Hours", type: "number", required: false, default: 0 },
          { key: "next_due_date", header: "Next Due Date", type: "date", required: false },
          { key: "performed_by", header: "Performed By", type: "text", required: false, width: 20 },
          {
            key: "status",
            header: "Status",
            type: "enum",
            required: false,
            enumValues: E.MAINTENANCE_STATUSES,
            default: "completed",
          },
        ],
      },
    ],
  },

  inventory: {
    type: "inventory",
    fileName: "Inventory.xlsx",
    title: "Inventory Workbook",
    description:
      "Stock restocks, waste and shrinkage. Trip-day onboard consumption is captured on the Hospitality workbook instead.",
    sheets: [
      {
        name: "Stock Movements",
        emptyRows: 10,
        columns: [
          { key: "item", header: "Item", type: "lookup", lookup: "inventory_items", required: true, width: 24 },
          {
            key: "movement_type",
            header: "Movement Type",
            type: "enum",
            required: true,
            enumValues: E.MOVEMENT_TYPES_INVENTORY_WORKBOOK,
          },
          { key: "quantity", header: "Quantity", type: "number", required: true },
          { key: "movement_date", header: "Movement Date", type: "date", required: true },
          { key: "unit_cost_inr", header: "Unit Cost (INR)", type: "inr", required: false },
          { key: "notes", header: "Notes", type: "text", required: false, width: 30 },
        ],
      },
    ],
  },

  feedback: {
    type: "feedback",
    fileName: "Feedback.xlsx",
    title: "Feedback Workbook",
    description: "Customer feedback/NPS and any complaints filed around this trip.",
    sheets: [
      {
        name: "Customer Feedback",
        emptyRows: 20,
        columns: [
          {
            key: "booking_ref",
            header: "Booking # (from Finance > Bookings, optional)",
            type: "booking_ref",
            required: false,
            width: 32,
          },
          { key: "rating_overall", header: "Rating Overall (1-5)", type: "integer", required: true },
          { key: "rating_captain", header: "Rating Captain (1-5)", type: "integer", required: false },
          { key: "rating_hospitality", header: "Rating Hospitality (1-5)", type: "integer", required: false },
          { key: "rating_value", header: "Rating Value (1-5)", type: "integer", required: false },
          { key: "nps_score", header: "NPS Score (0-10)", type: "integer", required: false },
          { key: "comments", header: "Comments", type: "text", required: false, width: 36 },
          { key: "submitted_date", header: "Submitted Date", type: "date", required: true },
        ],
      },
      {
        name: "Complaints",
        emptyRows: 10,
        columns: [
          {
            key: "booking_ref",
            header: "Booking # (from Finance > Bookings, optional)",
            type: "booking_ref",
            required: false,
            width: 32,
          },
          { key: "category", header: "Category", type: "text", required: true, width: 18 },
          { key: "description", header: "Description", type: "text", required: true, width: 34 },
          {
            key: "severity",
            header: "Severity",
            type: "enum",
            required: false,
            enumValues: E.COMPLAINT_SEVERITIES,
            default: "medium",
          },
          {
            key: "status",
            header: "Status",
            type: "enum",
            required: false,
            enumValues: E.COMPLAINT_STATUSES,
            default: "open",
          },
          { key: "filed_date", header: "Filed Date", type: "date", required: true },
          { key: "resolved_date", header: "Resolved Date", type: "date", required: false },
        ],
      },
    ],
  },

  marketing: {
    type: "marketing",
    fileName: "Marketing.xlsx",
    title: "Marketing Workbook",
    description: "Leads captured around this trip and which bookings they converted into.",
    sheets: [
      {
        name: "Leads",
        emptyRows: 15,
        columns: [
          { key: "channel", header: "Channel", type: "lookup", lookup: "marketing_channels", required: true, width: 26 },
          { key: "campaign_name", header: "Campaign Name (optional)", type: "text", required: false, width: 22 },
          { key: "customer_name", header: "Customer / Lead Name", type: "text", required: false, width: 22 },
          { key: "contact_info", header: "Contact Info", type: "text", required: false, width: 20 },
          { key: "captured_date", header: "Captured Date", type: "date", required: true },
          {
            key: "status",
            header: "Status",
            type: "enum",
            required: false,
            enumValues: E.LEAD_STATUSES,
            default: "new",
          },
          {
            key: "converted_booking_ref",
            header: "Converted Booking # (from Finance > Bookings, optional)",
            type: "booking_ref",
            required: false,
            width: 36,
          },
        ],
      },
    ],
  },
};
