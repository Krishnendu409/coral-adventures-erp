import { NextResponse } from 'next/server';
import { calculateHistoricalRecommendations } from '../../../../server/domain/pricing/rulesEngine';

export async function GET(request: Request) {
  const recommendations = calculateHistoricalRecommendations();
  return NextResponse.json(recommendations);
}
