"use client";

import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { PricingRecommendation } from '../../server/domain/pricing/rulesEngine';

export default function PricingDashboard() {
  const [recommendations, setRecommendations] = useState<PricingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pricing/recommendations')
      .then(res => res.json())
      .then(data => {
        setRecommendations(data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pricing Intelligence</h2>
          <p className="text-foreground-muted mt-1">
            Historical trend-based pricing recommendations for future strategy.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-foreground-muted">Loading recommendations...</div>
        ) : recommendations.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-foreground-muted bg-surface-sunken rounded-xl border border-border-default">
            No historical data found in the last 30 days to generate pricing trends.
          </div>
        ) : (
          recommendations.map((rec, i) => (
            <div key={i} className="flex flex-col bg-background/80 rounded-xl border border-border-default shadow-sm p-6 relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-semibold text-lg">{rec.cruiseTypeName}</h3>
                {rec.trend === 'surge' && (
                  <span className="flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 px-2 py-1 rounded-full">
                    <ArrowUpRight size={14} /> Surge
                  </span>
                )}
                {rec.trend === 'discount' && (
                  <span className="flex items-center gap-1 text-xs font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    <ArrowDownRight size={14} /> Discount
                  </span>
                )}
                {rec.trend === 'stable' && (
                  <span className="flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                    <Minus size={14} /> Stable
                  </span>
                )}
              </div>
              
              <div className="mb-4">
                <div className="text-3xl font-bold tracking-tight">₹{rec.recommendedPrice.toLocaleString()}</div>
                <div className="text-sm text-foreground-muted mt-1">Recommended Base Price</div>
              </div>
              
              <div className="mt-auto bg-surface-sunken p-3 rounded-lg border border-border-subtle text-sm text-foreground-muted">
                {rec.reasoning}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
