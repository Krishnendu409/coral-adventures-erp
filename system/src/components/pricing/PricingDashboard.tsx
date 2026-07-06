"use client";

import React, { useEffect, useState } from 'react';

interface Recommendation {
  recommendedPrice: number;
  reasoning: string;
}

export default function PricingDashboard() {
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

  useEffect(() => {
    fetch('/api/pricing/recommendations')
      .then(res => res.json())
      .then(data => setRecommendation(data));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Pricing Intelligence</h1>
      <div className="bg-white rounded-lg shadow p-6 max-w-xl">
        <h2 className="text-xl font-semibold mb-4">Current Recommendation</h2>
        {recommendation ? (
          <div>
            <p className="text-4xl font-bold text-blue-600 mb-2">
              ₹{recommendation.recommendedPrice}
            </p>
            <p className="text-gray-600 bg-gray-50 p-4 rounded-md">
              {recommendation.reasoning}
            </p>
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </div>
    </div>
  );
}
