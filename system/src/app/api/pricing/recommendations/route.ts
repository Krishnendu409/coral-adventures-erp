import { NextResponse } from 'next/server';
import { calculateRecommendation } from '../../../../server/domain/pricing/rulesEngine';

export async function GET(request: Request) {
  const recommendation = calculateRecommendation(0.86, 5, 'shoulder');
  return NextResponse.json(recommendation);
}
