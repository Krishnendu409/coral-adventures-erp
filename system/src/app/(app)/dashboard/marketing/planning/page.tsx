import { getDb } from "@/server/db/client";
import { getActiveChannels, projectChannelFunnel } from "@/server/domain/analytics/marketing";
import { MarketingTabs } from "../_components/marketing-tabs";
import { PlanningForm } from "./planning-form";

export const dynamic = "force-dynamic";

export default function MarketingPlanningPage() {
  const db = getDb();
  const channels = getActiveChannels(db);
  const cruiseTypes = db
    .prepare(`SELECT cruise_type_id, name, base_price_inr FROM cruise_types ORDER BY base_price_inr ASC`)
    .all() as { cruise_type_id: string; name: string; base_price_inr: number }[];

  const defaultChannel = channels[0];
  const defaultFootfall = defaultChannel
    ? Math.round((defaultChannel.reachablePersonsYear ?? 0) * (defaultChannel.reachPct ?? 1))
    : 0;

  const initialProjection = defaultChannel
    ? projectChannelFunnel(db, defaultChannel.channelId, defaultFootfall)
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Marketing Planning</h1>
        <p className="text-[13.5px] text-foreground-muted">
          Model a channel&apos;s funnel — Footfall → Capture → Leads → Conversion → Passengers → Revenue → Profit → ROI —
          before committing spend.
        </p>
      </div>

      <MarketingTabs />

      <PlanningForm
        channels={channels.map((c) => ({
          channelId: c.channelId,
          name: c.name,
          category: c.category,
          reachablePersonsYear: c.reachablePersonsYear,
          reachPct: c.reachPct,
          plannedAnnualSpendInr: c.plannedAnnualSpendInr,
          captureRate: c.captureRate,
          leadRate: c.leadRate,
          conversionRate: c.conversionRate,
        }))}
        cruiseTypes={cruiseTypes.map((c) => ({ id: c.cruise_type_id, name: c.name, basePriceInr: c.base_price_inr }))}
        defaultChannelId={defaultChannel?.channelId ?? ""}
        defaultFootfall={defaultFootfall}
        initialProjection={initialProjection}
      />
    </div>
  );
}
