import { expect, test, vi } from 'vitest';
import { GET } from '../../src/app/api/pricing/recommendations/route';

vi.mock('../../src/server/domain/settings/configRepository', () => ({
  getConfig: vi.fn((key: string) => {
    if (key === "BASE_TICKET_PRICE") return "2000";
    if (key === "HIGH_OCCUPANCY_THRESHOLD") return "0.80";
    if (key === "LOW_OCCUPANCY_THRESHOLD") return "0.50";
    return null;
  }),
}));

test('GET returns valid pricing recommendation JSON', async () => {
  const res = await GET(new Request('http://localhost/api/pricing/recommendations'));
  const json = await res.json();
  expect(Array.isArray(json)).toBe(true);
});
