import type { Db, DateRange } from "./shared";
import { db as resolveDb, safeDiv, round2, roundInt } from "./shared";

/**
 * Inventory Intelligence (CLAUDE.md Phase 6 "Inventory Intelligence").
 * Stock is never stored as a running balance column — it is always summed
 * live from inventory_stock_movements (restock - consumption - waste -
 * shrinkage).
 */

export interface ItemStockEstimate {
  itemId: string;
  name: string;
  unit: string;
  reorderLevel: number;
  restocked: number;
  consumed: number;
  wasted: number;
  shrunk: number;
  estimatedStock: number;
  belowReorderLevel: boolean;
}

function movementTotals(database: Db, itemId: string): { restock: number; consumption: number; waste: number; shrinkage: number } {
  const rows = database
    .prepare(
      `SELECT movement_type, COALESCE(SUM(quantity), 0) AS total FROM inventory_stock_movements
       WHERE item_id = ? GROUP BY movement_type`
    )
    .all(itemId) as { movement_type: string; total: number }[];

  const totals = { restock: 0, consumption: 0, waste: 0, shrinkage: 0 };
  for (const r of rows) {
    if (r.movement_type in totals) totals[r.movement_type as keyof typeof totals] = r.total;
  }
  return totals;
}

export function getCurrentStockEstimate(database: Db | undefined, itemId: string): ItemStockEstimate {
  const d = resolveDb(database);
  const item = d.prepare(`SELECT item_id, name, unit, reorder_level FROM inventory_items WHERE item_id = ?`).get(itemId) as
    | { item_id: string; name: string; unit: string; reorder_level: number }
    | undefined;
  if (!item) throw new Error(`inventory: unknown item_id '${itemId}'`);

  const totals = movementTotals(d, itemId);
  const estimatedStock = totals.restock - totals.consumption - totals.waste - totals.shrinkage;

  return {
    itemId: item.item_id,
    name: item.name,
    unit: item.unit,
    reorderLevel: item.reorder_level,
    restocked: round2(totals.restock),
    consumed: round2(totals.consumption),
    wasted: round2(totals.waste),
    shrunk: round2(totals.shrinkage),
    estimatedStock: round2(estimatedStock),
    belowReorderLevel: estimatedStock < item.reorder_level,
  };
}

export function getAllStockEstimates(database?: Db): ItemStockEstimate[] {
  const d = resolveDb(database);
  const items = d.prepare(`SELECT item_id FROM inventory_items WHERE status = 'active'`).all() as { item_id: string }[];
  return items.map((i) => getCurrentStockEstimate(d, i.item_id));
}

export function getReorderAlerts(database?: Db): ItemStockEstimate[] {
  return getAllStockEstimates(database).filter((i) => i.belowReorderLevel);
}

// ---------------------------------------------------------------------------
// Consumption rate over a range (units/day)
// ---------------------------------------------------------------------------

export interface ConsumptionRate {
  itemId: string;
  name: string;
  range: DateRange;
  totalConsumed: number;
  daysInRange: number;
  unitsPerDay: number;
}

export function getConsumptionRate(database: Db | undefined, itemId: string, range: DateRange): ConsumptionRate {
  const d = resolveDb(database);
  const item = d.prepare(`SELECT item_id, name FROM inventory_items WHERE item_id = ?`).get(itemId) as
    | { item_id: string; name: string }
    | undefined;
  if (!item) throw new Error(`inventory: unknown item_id '${itemId}'`);

  const row = d
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory_stock_movements
       WHERE item_id = ? AND movement_type = 'consumption' AND movement_date BETWEEN ? AND ?`
    )
    .get(itemId, range.from, range.to) as { total: number };

  const daysInRange = Math.max(
    1,
    Math.round((new Date(range.to + "T00:00:00Z").getTime() - new Date(range.from + "T00:00:00Z").getTime()) / 86_400_000) + 1
  );

  return {
    itemId: item.item_id,
    name: item.name,
    range,
    totalConsumed: round2(row.total),
    daysInRange,
    unitsPerDay: round2(safeDiv(row.total, daysInRange)),
  };
}

// ---------------------------------------------------------------------------
// Shrinkage totals
// ---------------------------------------------------------------------------

export function getShrinkageTotals(
  database: Db | undefined,
  range: DateRange
): { itemId: string; name: string; unitsShrunk: number; estimatedCostInr: number }[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT m.item_id AS itemId, i.name AS name, COALESCE(SUM(m.quantity), 0) AS unitsShrunk,
              COALESCE(SUM(m.quantity * COALESCE(m.unit_cost_inr, i.unit_cost_inr)), 0) AS estimatedCostInr
       FROM inventory_stock_movements m JOIN inventory_items i ON i.item_id = m.item_id
       WHERE m.movement_type = 'shrinkage' AND m.movement_date BETWEEN ? AND ?
       GROUP BY m.item_id ORDER BY estimatedCostInr DESC`
    )
    .all(range.from, range.to) as { itemId: string; name: string; unitsShrunk: number; estimatedCostInr: number }[];
  return rows.map((r) => ({ ...r, unitsShrunk: round2(r.unitsShrunk), estimatedCostInr: roundInt(r.estimatedCostInr) }));
}

// ---------------------------------------------------------------------------
// Vendor cost analysis
// ---------------------------------------------------------------------------

export function getVendorCostAnalysis(
  database: Db | undefined,
  range: DateRange
): { vendorName: string; totalCostInr: number; itemsRestocked: number }[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT COALESCE(i.vendor_name, '(unspecified)') AS vendorName,
              COALESCE(SUM(m.quantity * COALESCE(m.unit_cost_inr, i.unit_cost_inr)), 0) AS totalCostInr,
              COUNT(*) AS itemsRestocked
       FROM inventory_stock_movements m JOIN inventory_items i ON i.item_id = m.item_id
       WHERE m.movement_type = 'restock' AND m.movement_date BETWEEN ? AND ?
       GROUP BY vendorName ORDER BY totalCostInr DESC`
    )
    .all(range.from, range.to) as { vendorName: string; totalCostInr: number; itemsRestocked: number }[];
  return rows.map((r) => ({ ...r, totalCostInr: roundInt(r.totalCostInr) }));
}
