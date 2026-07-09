import { CalendarCheck, IndianRupee, Percent } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, EmptyState, Callout, Badge } from "@/components/ui";
import { formatInr, formatCompactNumber, formatPercent } from "@/lib/utils";
import { forecastRevenue, forecastBookings, forecastOccupancy } from "@/server/domain/analytics/forecasting";
import { ForecastTrendChart } from "./forecast-trend-chart";
import { HorizonSelector } from "./horizon-selector";

export const dynamic = "force-dynamic";

const ALLOWED_PERIODS = new Set([3, 6, 12]);

function parsePeriods(raw: string | undefined): number {
  const n = Number(raw);
  return ALLOWED_PERIODS.has(n) ? n : 3;
}

export default async function ForecastingPage({
  searchParams,
}: {
  searchParams: Promise<{ periods?: string }>;
}) {
  const { periods: rawPeriods } = await searchParams;
  const periods = parsePeriods(rawPeriods);

  const revenue = forecastRevenue(undefined, periods, 12);
  const bookings = forecastBookings(undefined, periods, 12);
  const occupancy = forecastOccupancy(undefined, periods, 12);

  const lastRevenue = revenue.forecast[revenue.forecast.length - 1];
  const lastBookings = bookings.forecast[bookings.forecast.length - 1];
  const lastOccupancy = occupancy.forecast[occupancy.forecast.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Forecasting Engine</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Directional revenue, bookings and occupancy projections from a linear trend + seasonality model.
          </p>
        </div>
        <HorizonSelector current={periods} />
      </div>

      <Callout tone="info" title="Directional estimate, not a demand-planning forecast">
        {revenue.disclaimer} Method: linear trend fitted over trailing history, tilted by the seasonality index for
        each target month.
      </Callout>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <IndianRupee size={15} /> Revenue
              </CardTitle>
              <CardDescription>Monthly, trailing 12 months + {periods}mo forecast</CardDescription>
            </div>
            {lastRevenue && (
              <div className="text-right">
                <p className="text-lg font-semibold tracking-tight text-foreground">{formatInr(lastRevenue.forecastValue)}</p>
                <p className="text-[12px] text-foreground-faint">in {periods} months</p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {revenue.history.length === 0 ? (
              <EmptyState title="Not enough history" description="Revenue forecast needs at least one month of completed payments." />
            ) : (
              <ForecastTrendChart history={revenue.history} forecast={revenue.forecast} metric="revenue_inr" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <CalendarCheck size={15} /> Bookings
              </CardTitle>
              <CardDescription>Monthly, trailing 12 months + {periods}mo forecast</CardDescription>
            </div>
            {lastBookings && (
              <div className="text-right">
                <p className="text-lg font-semibold tracking-tight text-foreground">{formatCompactNumber(lastBookings.forecastValue)}</p>
                <p className="text-[12px] text-foreground-faint">in {periods} months</p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {bookings.history.length === 0 ? (
              <EmptyState title="Not enough history" description="Bookings forecast needs at least one month of confirmed bookings." />
            ) : (
              <ForecastTrendChart history={bookings.history} forecast={bookings.forecast} metric="bookings" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Percent size={15} /> Occupancy
              </CardTitle>
              <CardDescription>Monthly, trailing 12 months + {periods}mo forecast</CardDescription>
            </div>
            {lastOccupancy && (
              <div className="text-right">
                <p className="text-lg font-semibold tracking-tight text-foreground">{formatPercent(lastOccupancy.forecastValue, 0)}</p>
                <p className="text-[12px] text-foreground-faint">in {periods} months</p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {occupancy.history.length === 0 ? (
              <EmptyState title="Not enough history" description="Occupancy forecast needs at least one month of completed trips." />
            ) : (
              <ForecastTrendChart history={occupancy.history} forecast={occupancy.forecast} metric="occupancy_pct" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-[12px] text-foreground-faint">
        <Badge tone="neutral">method: {revenue.method}</Badge>
      </div>
    </div>
  );
}
