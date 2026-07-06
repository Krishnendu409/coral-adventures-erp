import { getConfig } from "../settings/configRepository";

export function calculateRecommendation(occupancy: number, velocity: number, season: string) {
  // Fetch from config, fallback to defaults if not set
  const basePriceStr = getConfig("BASE_TICKET_PRICE");
  const highOccStr = getConfig("HIGH_OCCUPANCY_THRESHOLD");
  const lowOccStr = getConfig("LOW_OCCUPANCY_THRESHOLD");

  const basePrice = basePriceStr ? parseFloat(basePriceStr) : 2500;
  const highOcc = highOccStr ? parseFloat(highOccStr) : 0.85;
  const lowOcc = lowOccStr ? parseFloat(lowOccStr) : 0.50;

  if (occupancy > highOcc && season === 'shoulder') {
    return {
      recommendedPrice: basePrice * 1.2,
      reasoning: `Increase price by 20% due to high occupancy (> ${highOcc * 100}%).`
    };
  }
  if (occupancy < lowOcc) {
    return {
      recommendedPrice: basePrice * 0.85,
      reasoning: `Decrease price by 15% due to low occupancy (< ${lowOcc * 100}%).`
    };
  }
  return { recommendedPrice: basePrice, reasoning: 'Maintain Base Price.' };
}
