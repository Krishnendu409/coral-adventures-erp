import { notFound } from "next/navigation";
import Link from "next/link";
import { Ship, MapPin, Anchor, Fuel, CloudSun, Users as UsersIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatTile,
  EmptyState,
  Badge,
  Callout,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui";
import { formatInr } from "@/lib/utils";
import { getDb } from "@/server/db/client";
import { loadTripContext, type TripContext } from "@/server/domain/templates/tripContext";
import { getPerTripProfit } from "@/server/domain/analytics/financial";

export const dynamic = "force-dynamic";

const TRIP_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success",
  scheduled: "neutral",
  cancelled: "danger",
};

const BOOKING_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  completed: "success",
  confirmed: "info",
  no_show: "warning",
  cancelled: "danger",
};

const PAYMENT_STATUS_TONE: Record<string, "success" | "warning" | "danger"> = {
  completed: "success",
  pending: "warning",
  failed: "danger",
};

interface BookingRow {
  booking_id: string;
  customer_id: string;
  customer_name: string;
  passenger_count: number;
  status: string;
  booking_date: string;
  cruise_type_name: string;
}

interface PaymentRow {
  payment_id: string;
  amount_inr: number;
  payment_method: string;
  payment_type: string;
  status: string;
  payment_date: string;
  booking_id: string;
}

interface FuelLogRow {
  fuel_log_id: number;
  liters_consumed: number;
  cost_inr: number;
  engine_hours: number;
  logged_at: string;
}

interface WeatherLogRow {
  weather_id: number;
  log_date: string;
  condition: string;
  wind_speed_kmh: number | null;
  wave_height_m: number | null;
  temperature_c: number | null;
  visibility: string | null;
  notes: string | null;
}

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  let trip: TripContext;
  try {
    trip = loadTripContext(db, id);
  } catch {
    notFound();
  }

  const bookings = db
    .prepare(
      `SELECT b.booking_id, b.customer_id, c.full_name AS customer_name, b.passenger_count, b.status, b.booking_date,
              ct.name AS cruise_type_name
       FROM bookings b
       JOIN customers c ON c.customer_id = b.customer_id
       JOIN cruise_types ct ON ct.cruise_type_id = b.cruise_type_id
       WHERE b.trip_id = ?
       ORDER BY b.booking_date`
    )
    .all(id) as BookingRow[];

  const payments = db
    .prepare(
      `SELECT p.payment_id, p.amount_inr, p.payment_method, p.payment_type, p.status, p.payment_date, p.booking_id
       FROM payments p
       JOIN bookings b ON b.booking_id = p.booking_id
       WHERE b.trip_id = ?
       ORDER BY p.payment_date`
    )
    .all(id) as PaymentRow[];

  const fuelLogs = db.prepare(`SELECT * FROM fuel_logs WHERE trip_id = ? ORDER BY logged_at`).all(id) as FuelLogRow[];
  const weatherLogs = db.prepare(`SELECT * FROM weather_logs WHERE trip_id = ? ORDER BY log_date`).all(id) as WeatherLogRow[];

  const profit = getPerTripProfit(db, { from: trip.tripDate, to: trip.tripDate }).find((t) => t.tripId === id);

  const totalPassengers = bookings
    .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
    .reduce((sum, b) => sum + b.passenger_count, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{trip.tripId}</h1>
            <Badge tone={TRIP_STATUS_TONE[trip.status] ?? "neutral"}>{trip.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            {trip.tripDate} · {trip.slot} slot · {trip.routeName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Vessel" value={trip.vesselName} icon={<Ship size={16} />} />
        <StatTile label="Route" value={trip.routeName} icon={<MapPin size={16} />} />
        <StatTile label="Cruise type" value={trip.cruiseTypeName} icon={<Anchor size={16} />} />
        <StatTile label="Captain" value={trip.captainName ?? "Unassigned"} icon={<UsersIcon size={16} />} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>Planned vs. actual timings</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div>
            <p className="text-[12px] text-foreground-faint">Scheduled departure</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{trip.scheduledDeparture}</p>
          </div>
          <div>
            <p className="text-[12px] text-foreground-faint">Scheduled return</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{trip.scheduledReturn}</p>
          </div>
          <div>
            <p className="text-[12px] text-foreground-faint">Capacity</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{trip.capacity} passengers</p>
          </div>
          <div>
            <p className="text-[12px] text-foreground-faint">Booked passengers</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{totalPassengers} / {trip.capacity}</p>
          </div>
        </CardContent>
      </Card>

      {profit ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Revenue" value={formatInr(profit.revenueInr)} />
          <StatTile label="Expenses" value={formatInr(profit.expensesInr)} />
          <StatTile label="Profit" value={formatInr(profit.profitInr)} />
        </div>
      ) : (
        <Callout tone="info" title="Profit not available">
          {trip.status === "cancelled"
            ? "This trip was cancelled, so no profit is computed for it."
            : "No revenue or expense facts are linked to this trip yet."}
        </Callout>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Bookings &amp; Passengers</CardTitle>
            <CardDescription>{bookings.length} booking(s) on this trip</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <EmptyState title="No bookings" description="No bookings have been recorded for this trip." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Customer</TableHeaderCell>
                  <TableHeaderCell>Cruise type</TableHeaderCell>
                  <TableHeaderCell className="text-right">Passengers</TableHeaderCell>
                  <TableHeaderCell>Booking date</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.booking_id}>
                    <TableCell>
                      <Link href={`/customers/${b.customer_id}`} className="font-medium text-ocean-700 hover:underline dark:text-ocean-300">
                        {b.customer_name}
                      </Link>
                      <div className="text-[12px] text-foreground-faint">{b.booking_id}</div>
                    </TableCell>
                    <TableCell>{b.cruise_type_name}</TableCell>
                    <TableCell className="text-right">{b.passenger_count}</TableCell>
                    <TableCell>{b.booking_date}</TableCell>
                    <TableCell>
                      <Badge tone={BOOKING_STATUS_TONE[b.status] ?? "neutral"}>{b.status.replace("_", " ")}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Payments</CardTitle>
            <CardDescription>{payments.length} payment(s) linked to this trip's bookings</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState title="No payments" description="No payments have been recorded for this trip's bookings." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Booking</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Method</TableHeaderCell>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.payment_id}>
                    <TableCell className="text-foreground-muted">{p.booking_id}</TableCell>
                    <TableCell className="capitalize">{p.payment_type}</TableCell>
                    <TableCell className="capitalize">{p.payment_method.replace("_", " ")}</TableCell>
                    <TableCell>{p.payment_date}</TableCell>
                    <TableCell>
                      <Badge tone={PAYMENT_STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {p.payment_type === "refund" ? "−" : ""}
                      {formatInr(p.amount_inr)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Fuel size={15} /> Fuel Log
              </CardTitle>
              <CardDescription>Consumption &amp; engine hours for this trip</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {fuelLogs.length === 0 ? (
              <EmptyState title="No fuel log" description="No fuel log entries have been recorded for this trip." />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Logged at</TableHeaderCell>
                    <TableHeaderCell className="text-right">Liters</TableHeaderCell>
                    <TableHeaderCell className="text-right">Engine hours</TableHeaderCell>
                    <TableHeaderCell className="text-right">Cost</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fuelLogs.map((f) => (
                    <TableRow key={f.fuel_log_id}>
                      <TableCell>{f.logged_at}</TableCell>
                      <TableCell className="text-right">{f.liters_consumed.toFixed(1)} L</TableCell>
                      <TableCell className="text-right">{f.engine_hours.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-medium">{formatInr(f.cost_inr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <CloudSun size={15} /> Weather Log
              </CardTitle>
              <CardDescription>Conditions recorded for this trip</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {weatherLogs.length === 0 ? (
              <EmptyState title="No weather log" description="No weather log entries have been recorded for this trip." />
            ) : (
              <ul className="space-y-3">
                {weatherLogs.map((w) => (
                  <li key={w.weather_id} className="rounded-[var(--radius-md)] border border-border-subtle p-3 text-[13px]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{w.condition}</span>
                      <span className="text-foreground-faint">{w.log_date}</span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-2 text-foreground-muted">
                      <span>Wind: {w.wind_speed_kmh != null ? `${w.wind_speed_kmh.toFixed(1)} km/h` : "—"}</span>
                      <span>Waves: {w.wave_height_m != null ? `${w.wave_height_m.toFixed(1)} m` : "—"}</span>
                      <span>Temp: {w.temperature_c != null ? `${w.temperature_c.toFixed(1)}°C` : "—"}</span>
                    </div>
                    {w.visibility && <p className="mt-1 text-foreground-faint">Visibility: {w.visibility}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
