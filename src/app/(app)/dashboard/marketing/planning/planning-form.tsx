"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Button, Callout, Card, CardContent, CardHeader, CardTitle, FieldGroup, Input, Label, Select } from "@/components/ui";
import { formatCompactNumber, formatInr, formatPercent } from "@/lib/utils";
import { StageBarChart } from "../_components/charts";

export interface PlanningChannel {
  channelId: string;
  name: string;
  category: string;
  reachablePersonsYear: number | null;
  reachPct: number | null;
  plannedAnnualSpendInr: number | null;
  captureRate: number | null;
  leadRate: number | null;
  conversionRate: number | null;
}

export interface PlanningCruiseType {
  id: string;
  name: string;
  basePriceInr: number;
}

export interface FunnelProjection {
  channelId: string;
  footfallInput: number;
  captured: number;
  leads: number;
  convertedBookings: number;
  passengers: number;
  revenueInr: number;
  variableCostInr: number;
  grossProfitInr: number;
  spendInr: number;
  netProfitInr: number;
  roiPct: number | null;
}

function recommendationFor(projection: FunnelProjection, channelName: string): { tone: "success" | "warning" | "danger"; text: string } {
  if (projection.convertedBookings <= 0) {
    return {
      tone: "warning",
      text: `At this footfall, ${channelName} isn't projected to convert any bookings. Raise footfall, capture rate, or reconsider this channel.`,
    };
  }
  if (projection.roiPct === null) {
    return { tone: "warning", text: "No spend basis is set for this channel, so ROI can't be projected — enter a spend override." };
  }
  if (projection.roiPct >= 50) {
    return {
      tone: "success",
      text: `Strong projected return (${formatPercent(projection.roiPct)} ROI). ${channelName} can absorb additional spend at this footfall.`,
    };
  }
  if (projection.roiPct >= 0) {
    return {
      tone: "success",
      text: `Positive but modest projected return (${formatPercent(projection.roiPct)} ROI). Worth continued investment; watch for diminishing returns as spend scales.`,
    };
  }
  return {
    tone: "danger",
    text: `Projected net loss at this footfall (${formatPercent(projection.roiPct)} ROI). Reduce spend, improve conversion, or pause this channel.`,
  };
}

export function PlanningForm({
  channels,
  cruiseTypes,
  defaultChannelId,
  defaultFootfall,
  initialProjection,
}: {
  channels: PlanningChannel[];
  cruiseTypes: PlanningCruiseType[];
  defaultChannelId: string;
  defaultFootfall: number;
  initialProjection: FunnelProjection | null;
}) {
  const [channelId, setChannelId] = useState(defaultChannelId);
  const [footfall, setFootfall] = useState(String(defaultFootfall));
  const [cruiseTypeId, setCruiseTypeId] = useState<string>("");
  const [spendInr, setSpendInr] = useState<string>("");
  const [projection, setProjection] = useState<FunnelProjection | null>(initialProjection);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channel = channels.find((c) => c.channelId === channelId);

  async function runProjection(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const footfallNum = Number(footfall);
    if (!channelId || Number.isNaN(footfallNum) || footfallNum < 0) {
      setError("Enter a channel and a non-negative footfall number.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: "project", channelId, footfall: String(footfallNum) });
      if (cruiseTypeId) params.set("cruiseTypeId", cruiseTypeId);
      if (spendInr) params.set("spendInr", spendInr);
      const res = await fetch(`/api/analytics/marketing?${params.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as FunnelProjection;
      setProjection(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to project funnel.");
    } finally {
      setLoading(false);
    }
  }

  function onChannelChange(nextId: string) {
    setChannelId(nextId);
    const nextChannel = channels.find((c) => c.channelId === nextId);
    if (nextChannel) {
      const basis = Math.round((nextChannel.reachablePersonsYear ?? 0) * (nextChannel.reachPct ?? 1));
      setFootfall(String(basis));
    }
  }

  const stages =
    projection && [
      { label: "Footfall", value: projection.footfallInput },
      { label: "Captured", value: projection.captured },
      { label: "Leads", value: projection.leads },
      { label: "Converted", value: projection.convertedBookings },
      { label: "Passengers", value: projection.passengers },
    ];

  const recommendation = projection && channel ? recommendationFor(projection, channel.name) : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Funnel inputs</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form className="space-y-4" onSubmit={runProjection}>
            <FieldGroup>
              <Label htmlFor="channel">Channel</Label>
              <Select id="channel" value={channelId} onChange={(e) => onChannelChange(e.target.value)}>
                {channels.map((c) => (
                  <option key={c.channelId} value={c.channelId}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="footfall">Footfall / reach</Label>
              <Input
                id="footfall"
                type="number"
                min={0}
                value={footfall}
                onChange={(e) => setFootfall(e.target.value)}
                placeholder="e.g. 1500000"
              />
              {channel && (
                <p className="text-[12px] text-foreground-muted">
                  Channel capture {formatPercent((channel.captureRate ?? 0) * 100)} · lead {formatPercent((channel.leadRate ?? 0) * 100)} ·
                  conversion {formatPercent((channel.conversionRate ?? 0) * 100)}
                </p>
              )}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="cruiseType">Cruise type</Label>
              <Select id="cruiseType" value={cruiseTypeId} onChange={(e) => setCruiseTypeId(e.target.value)}>
                <option value="">Blended (weighted average price)</option>
                {cruiseTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name} ({formatInr(ct.basePriceInr)})
                  </option>
                ))}
              </Select>
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="spend">Spend override (₹, optional)</Label>
              <Input
                id="spend"
                type="number"
                min={0}
                value={spendInr}
                onChange={(e) => setSpendInr(e.target.value)}
                placeholder={channel?.plannedAnnualSpendInr ? `Default: ${formatInr(channel.plannedAnnualSpendInr)}` : "0"}
              />
            </FieldGroup>

            {error && (
              <p className="text-[12.5px] text-danger" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              <Calculator size={15} />
              {loading ? "Projecting…" : "Project funnel"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {recommendation && (
          <Callout tone={recommendation.tone} title="Recommendation">
            {recommendation.text}
          </Callout>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Funnel projection{channel ? ` — ${channel.name}` : ""}</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {stages ? (
              <StageBarChart data={stages} formatType="compact" />
            ) : (
              <p className="text-sm text-foreground-muted">No channels available to project.</p>
            )}
          </CardContent>
        </Card>

        {projection && (
          <Card>
            <CardHeader>
              <CardTitle>Financial outcome</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3">
              <Metric label="Revenue" value={formatInr(projection.revenueInr)} />
              <Metric label="Variable cost" value={formatInr(projection.variableCostInr)} />
              <Metric label="Gross profit" value={formatInr(projection.grossProfitInr)} />
              <Metric label="Spend" value={formatInr(projection.spendInr)} />
              <Metric
                label="Net profit"
                value={formatInr(projection.netProfitInr)}
                tone={projection.netProfitInr >= 0 ? "success" : "danger"}
              />
              <Metric
                label="ROI"
                value={projection.roiPct !== null ? formatPercent(projection.roiPct) : "—"}
                tone={projection.roiPct !== null ? (projection.roiPct >= 0 ? "success" : "danger") : undefined}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div>
      <div className="text-[12px] font-medium text-foreground-muted">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
