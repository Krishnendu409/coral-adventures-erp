import { expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';

test('pricing schema file exists', () => {
  const schemaPath = path.resolve(__dirname, '../../src/server/db/schema/005_pricing.sql');
  expect(fs.existsSync(schemaPath)).toBe(true);
});
