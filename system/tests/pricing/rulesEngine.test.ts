import { expect, test } from 'vitest';
import { calculateRecommendation } from '../../src/server/domain/pricing/rulesEngine';

test('recommends 20% surge for >85% occupancy in shoulder season', () => {
  const result = calculateRecommendation(0.86, 5, 1000, 'shoulder');
  expect(result.recommendedPrice).toBe(1200);
  expect(result.reasoning).toContain('Increase price by 20% due to high occupancy');
});

test('recommends 15% discount for <50% occupancy', () => {
  const result = calculateRecommendation(0.40, 1, 1000, 'shoulder');
  expect(result.recommendedPrice).toBe(850);
});
