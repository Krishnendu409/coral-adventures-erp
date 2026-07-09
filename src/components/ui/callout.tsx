import type { HTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const toneConfig: Record<Tone, { icon: typeof Info; classes: string }> = {
  info: { icon: Info, classes: "bg-info-subtle text-ocean-900 border-ocean-200" },
  success: { icon: CheckCircle2, classes: "bg-success-subtle text-success border-success" },
  warning: { icon: AlertTriangle, classes: "bg-warning-subtle text-warning border-warning" },
  danger: { icon: XCircle, classes: "bg-danger-subtle text-danger border-danger" },
};

export function Callout({
  tone = "info",
  title,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone; title?: string }) {
  const { icon: Icon, classes } = toneConfig[tone];
  return (
    <div
      className={cn("flex gap-3 rounded-[var(--radius-md)] border p-4 text-[13px]", classes, className)}
      {...props}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        <div className="opacity-90">{children}</div>
      </div>
    </div>
  );
}
