import { expect, test } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import PricingDashboard from '../../src/components/pricing/PricingDashboard';

test('Dashboard renders title', () => {
  const html = ReactDOMServer.renderToString(React.createElement(PricingDashboard));
  expect(html).toContain('Pricing Intelligence');
});
