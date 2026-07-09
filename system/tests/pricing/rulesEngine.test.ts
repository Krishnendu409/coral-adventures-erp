import { expect, test, vi } from 'vitest';
import { calculateRecommendation } from '../../src/server/domain/pricing/rulesEngine';

vi.mock('../../src/server/domain/settings/configRepository', () => ({
  getConfig: vi.fn((key: string) => {
    if (key === "BASE_TICKET_PRICE") return "2000";
    if (key === "HIGH_OCCUPANCY_THRESHOLD") return "0.85";
    if (key === "LOW_OCCUPANCY_THRESHOLD") return "0.50";
    return null;
  }),
}));

test('recommends 20% surge for >85% occupancy', () => {
  const result = calculateRecommendation(0.86, 2000, 0.85, 0.50);
  expect(result.recommendedPrice).toBe(2400); // 2000 * 1.2 = 2400
  expect(result.reasoning).toContain('surge');
});

test('recommends 15% discount for <50% occupancy', () => {
  const result = calculateRecommendation(0.40, 2000, 0.85, 0.50);
  expect(result.recommendedPrice).toBe(1700); // 2000 * 0.85 = 1700
  expect(result.reasoning).toContain('discount');
});

test('recommends stable price for normal occupancy', () => {
  const result = calculateRecommendation(0.65, 2000, 0.85, 0.50);
  expect(result.recommendedPrice).toBe(2000);
  expect(result.reasoning).toContain('Stable');
});
