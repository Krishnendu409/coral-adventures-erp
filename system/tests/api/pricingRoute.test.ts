import { expect, test } from 'vitest';
import { GET } from '../../src/app/api/pricing/recommendations/route';

test('GET returns valid pricing recommendation JSON', async () => {
  const res = await GET(new Request('http://localhost/api/pricing/recommendations'));
  const json = await res.json();
  expect(json.recommendedPrice).toBeDefined();
});
