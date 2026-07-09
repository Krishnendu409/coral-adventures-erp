"use server";

import { getDb } from "../../db/client";
import { revalidatePath } from "next/cache";

export interface BusinessParameter {
  param_id: string;
  parameter: string;
  value: number | null;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  category: string | null;
  notes: string | null;
  erp_field: string;
  updated_at: string;
}

export async function getBusinessParameters(): Promise<BusinessParameter[]> {
  const db = getDb();
  return db
    .prepare("SELECT * FROM business_parameters ORDER BY category, parameter")
    .all() as BusinessParameter[];
}

export async function updateBusinessParameter(param_id: string, value: number): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    
    // Bounds checking removed as per user request
    const param = db.prepare("SELECT * FROM business_parameters WHERE param_id = ?").get(param_id) as BusinessParameter;
    if (!param) return { success: false, error: "Parameter not found" };

    db.prepare(
      "UPDATE business_parameters SET value = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE param_id = ?"
    ).run(value, param_id);
    
    // Invalidate dashboard and analytics pages since they rely on these parameters
    revalidatePath("/dashboard", "layout");
    revalidatePath("/settings", "layout");
    
    return { success: true };
  } catch (error) {
    console.error("Failed to update parameter:", error);
    return { success: false, error: "Failed to update parameter" };
  }
}
