"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/marketing", label: "Overview" },
  { href: "/dashboard/marketing/planning", label: "Planning" },
  { href: "/dashboard/marketing/scenarios", label: "Scenarios" },
  { href: "/dashboard/marketing/budget-allocation", label: "Budget Allocation" },
] as const;

/** Secondary in-page tab strip for the four Marketing Intelligence pages.
 * The primary sidebar only links to /dashboard/marketing, so this is the
 * only way to move between Overview / Planning / Scenarios / Budget
 * Allocation without hunting for a URL. */
export function MarketingTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b border-border-subtle">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative px-3.5 py-2.5 text-[13.5px] font-medium transition-colors",
              active ? "text-ocean-700 dark:text-ocean-200" : "text-foreground-muted hover:text-foreground"
            )}
          >
            {tab.label}
            {active && (
              <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-ocean-500 dark:bg-ocean-300" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
