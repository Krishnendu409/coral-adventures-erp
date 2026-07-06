export function calculateRecommendation(occupancy: number, velocity: number, basePrice: number, season: string) {
  if (occupancy > 0.85 && season === 'shoulder') {
    return {
      recommendedPrice: basePrice * 1.2,
      reasoning: 'Increase price by 20% due to high occupancy.'
    };
  }
  if (occupancy < 0.50) {
    return {
      recommendedPrice: basePrice * 0.85,
      reasoning: 'Decrease price by 15% due to low occupancy.'
    };
  }
  return { recommendedPrice: basePrice, reasoning: 'Maintain Base Price.' };
}
