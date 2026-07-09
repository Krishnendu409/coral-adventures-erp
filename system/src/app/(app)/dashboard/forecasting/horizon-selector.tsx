"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const OPTIONS = [3, 6, 12] as const;

export function HorizonSelector({ current }: { current: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setPeriods(periods: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("periods", String(periods));
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="inline-flex items-center rounded-[var(--radius-md)] border border-border-default bg-surface p-0.5">
      {OPTIONS.map((periods) => (
        <button
          key={periods}
          type="button"
          onClick={() => setPeriods(periods)}
          className={cn(
            "rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-medium transition-colors",
            current === periods ? "bg-ocean-500 text-neutral-0" : "text-foreground-muted hover:bg-surface-sunken hover:text-foreground"
          )}
        >
          {periods}mo
        </button>
      ))}
    </div>
  );
}
