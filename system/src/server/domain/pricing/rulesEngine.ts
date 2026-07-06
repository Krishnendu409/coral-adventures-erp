import { getDb } from "../../db/client";
import { getConfig } from "../settings/configRepository";

export interface PricingRecommendation {
  cruiseTypeId: string;
  cruiseTypeName: string;
  recommendedPrice: number;
  reasoning: string;
  trend: 'surge' | 'discount' | 'stable';
}

export function calculateHistoricalRecommendations(): PricingRecommendation[] {
  const db = getDb();
  
  // Fetch from config, fallback to defaults
  const basePriceStr = getConfig("BASE_TICKET_PRICE");
  const highOccStr = getConfig("HIGH_OCCUPANCY_THRESHOLD");
  const lowOccStr = getConfig("LOW_OCCUPANCY_THRESHOLD");

  const basePrice = basePriceStr ? parseFloat(basePriceStr) : 2500;
  const highOcc = highOccStr ? parseFloat(highOccStr) : 0.85;
  const lowOcc = lowOccStr ? parseFloat(lowOccStr) : 0.50;

  // Get average occupancy per cruise type over the last 30 days
  const query = `
    SELECT 
      ct.cruise_type_id as cruiseTypeId,
      ct.name as cruiseTypeName,
      SUM(b.passenger_count) as total_passengers,
      SUM(t.capacity) as total_capacity,
      CAST(SUM(b.passenger_count) AS REAL) / NULLIF(SUM(t.capacity), 0) as avg_occupancy
    FROM trips t
    JOIN cruise_types ct ON t.cruise_type_id = ct.cruise_type_id
    LEFT JOIN bookings b ON t.trip_id = b.trip_id AND b.status = 'confirmed'
    WHERE t.status = 'completed'
      AND date(t.trip_date) >= date('now', '-30 days')
    GROUP BY ct.cruise_type_id, ct.name
  `;

  const results: any[] = db.prepare(query).all() || [];

  return results.map(row => {
    const occ = row.avg_occupancy || 0;
    
    if (occ > highOcc) {
      return {
        cruiseTypeId: row.cruiseTypeId,
        cruiseTypeName: row.cruiseTypeName,
        recommendedPrice: Math.round(basePrice * 1.2),
        reasoning: `High historical occupancy (${(occ * 100).toFixed(1)}%). Recommend +20% base price surge.`,
        trend: 'surge'
      };
    } else if (occ > 0 && occ < lowOcc) {
      return {
        cruiseTypeId: row.cruiseTypeId,
        cruiseTypeName: row.cruiseTypeName,
        recommendedPrice: Math.round(basePrice * 0.85),
        reasoning: `Low historical occupancy (${(occ * 100).toFixed(1)}%). Recommend 15% discount to drive volume.`,
        trend: 'discount'
      };
    }

    return {
      cruiseTypeId: row.cruiseTypeId,
      cruiseTypeName: row.cruiseTypeName,
      recommendedPrice: basePrice,
      reasoning: `Stable occupancy (${(occ * 100).toFixed(1)}%). Maintain base price.`,
      trend: 'stable'
    };
  });
}
