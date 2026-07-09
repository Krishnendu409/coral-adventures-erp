import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatTileProps {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  icon?: ReactNode;
  intent?: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
  className?: string;
}

const intentStyles = {
  primary: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  success: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  warning: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
  danger: "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  info: "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400",
  neutral: "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400"
};

/** Compact executive KPI tile — matches the requested premium design mockup. */
export function StatTile({ label, value, delta, deltaLabel, icon, intent = "primary", className }: StatTileProps) {
  const trend = delta == null ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const trendColor =
    trend === "up" ? "text-success-600 dark:text-success-500" : trend === "down" ? "text-danger-600 dark:text-danger-500" : "text-foreground-faint";
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] bg-surface border border-border-subtle shadow-sm p-5 flex items-start gap-4 transition-all duration-200 hover:shadow-md",
        className
      )}
    >
      {/* Icon Box */}
      {icon && (
        <div className={cn("flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl", intentStyles[intent])}>
          {icon}
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col flex-1 overflow-hidden pt-0.5">
        <span className="text-[13px] font-semibold text-foreground-muted truncate mb-1">{label}</span>
        <div className="text-3xl font-bold tracking-tight text-foreground leading-none mb-3">{value}</div>
        
        {delta != null && (
          <div className={cn("flex items-center gap-1.5 text-[13px] font-medium", trendColor)}>
            <TrendIcon size={16} className="stroke-[2.5]" />
            <span>{Math.abs(delta).toFixed(1)}%</span>
            {deltaLabel && <span className="text-foreground-faint font-normal">{deltaLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
