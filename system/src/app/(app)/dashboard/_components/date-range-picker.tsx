"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Preset date-range picker: navigates via router.push with updated ?from=&to=
 * query params on the current pathname. Deliberately not a calendar widget —
 * a small set of buttons plus a custom fallback covers the real workflow
 * (managers reviewing "this month" / "last quarter" style windows).
 *
 * Date math mirrors src/server/domain/analytics/shared.ts (UTC-based
 * "YYYY-MM-DD" arithmetic) but is duplicated here in a client-safe form since
 * shared.ts pulls in the better-sqlite3-backed db client and can't be
 * imported into client bundles.
 */

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfMonthStr(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function startOfQuarterStr(dateStr: string): string {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`;
}

interface Preset {
  key: string;
  label: string;
  range: (today: string) => { from: string; to: string };
}

const PRESETS: Preset[] = [
  { key: "30d", label: "Last 30 Days", range: (today) => ({ from: addDaysStr(today, -29), to: today }) },
  { key: "90d", label: "Last 90 Days", range: (today) => ({ from: addDaysStr(today, -89), to: today }) },
  { key: "month", label: "This Month", range: (today) => ({ from: startOfMonthStr(today), to: today }) },
  { key: "quarter", label: "This Quarter", range: (today) => ({ from: startOfQuarterStr(today), to: today }) },
];

export function DateRangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const today = todayStr();

  function navigate(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams({ from: nextFrom, to: nextTo });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => {
        const r = preset.range(today);
        const active = r.from === from && r.to === to;
        return (
          <Button
            key={preset.key}
            size="sm"
            variant={active ? "primary" : "secondary"}
            onClick={() => {
              setCustomOpen(false);
              navigate(r.from, r.to);
            }}
          >
            {preset.label}
          </Button>
        );
      })}
      <Button
        size="sm"
        variant={customOpen ? "primary" : "outline"}
        onClick={() => {
          setCustomFrom(from);
          setCustomTo(to);
          setCustomOpen((v) => !v);
        }}
      >
        Custom
      </Button>
      {customOpen && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border-default bg-surface p-1.5">
          <Input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-7 w-[140px] text-[13px]"
          />
          <span className="text-[12px] text-foreground-faint">to</span>
          <Input
            type="date"
            value={customTo}
            min={customFrom}
            max={today}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-7 w-[140px] text-[13px]"
          />
          <Button size="sm" onClick={() => navigate(customFrom, customTo)}>
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
