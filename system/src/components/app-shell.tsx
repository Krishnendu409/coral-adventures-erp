"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  LineChart,
  Megaphone,
  Ship,
  Users,
  Wrench,
  Boxes,
  TrendingUp,
  Upload,
  Download,
  FileText,
  Settings,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatWidget } from "@/components/ai/ChatWidget";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Executive", icon: LayoutDashboard },
  { href: "/dashboard/financial", label: "Financial", icon: LineChart },
  { href: "/dashboard/operations", label: "Operations", icon: Ship },
  { href: "/dashboard/marketing", label: "Marketing", icon: Megaphone },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/dashboard/inventory", label: "Inventory", icon: Boxes },
  { href: "/dashboard/forecasting", label: "Forecasting", icon: TrendingUp },
  { href: "/dashboard/pricing", label: "Pricing AI", icon: LineChart },
  { href: "/dashboard/expansion", label: "Expansion", icon: Compass },
];

const NAV_SECONDARY: NavItem[] = [
  { href: "/import", label: "Import Trips", icon: Upload },
  { href: "/downloads", label: "Downloads", icon: Download },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings/assumptions", label: "Settings", icon: Settings }
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-[13.5px] font-medium transition-colors",
        active
          ? "bg-ocean-50 text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-200"
          : "text-foreground-muted hover:bg-surface-sunken hover:text-foreground"
      )}
    >
      <Icon size={16} className={active ? "text-ocean-600 dark:text-ocean-300" : ""} />
      {item.label}
    </Link>
  );
}

export function AppShell({ children, businessName = "Coral Adventures" }: { children: React.ReactNode, businessName?: string }) {
  const pathname = usePathname();

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden p-3 md:p-4 gap-4 shader-mesh-bg">
      <ChatWidget />
      <aside className="hidden w-64 shrink-0 flex-col md:flex py-4 relative z-10 bg-gradient-to-b from-ocean-800 to-ocean-900 border border-black/20 rounded-[2rem] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 mb-4 relative z-10">
          <Image src="/brand/logo-256.png" alt={businessName} width={32} height={32} className="rounded-xl shadow-sm" priority />
          <span className="text-[15px] font-bold tracking-tight text-white drop-shadow-sm">{businessName}</span>
        </div>
        
        <nav className="flex-1 space-y-1 px-4 overflow-y-auto relative z-10 no-scrollbar">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-lg)] px-3 py-2.5 text-[14px] font-medium transition-all duration-200 ease-out active:scale-[0.98]",
                  active
                    ? "bg-white/10 text-white shadow-sm border border-white/5"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon size={18} className={cn("transition-colors", active ? "text-white" : "text-white/50")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="mt-auto px-4 pb-4 relative z-10">
          <div className="space-y-1 pt-4 border-t border-white/10">
            {NAV_SECONDARY.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-lg)] px-3 py-2.5 text-[14px] font-medium transition-all duration-200 ease-out active:scale-[0.98]",
                    active
                      ? "bg-white/10 text-white shadow-sm border border-white/5"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon size={18} className={cn("transition-colors", active ? "text-white" : "text-white/50")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col relative z-0">
        <div className="flex-1 flex flex-col bg-background/80 backdrop-blur-[64px] rounded-[2rem] overflow-hidden relative shadow-2xl ring-1 ring-border-default">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-subtle bg-transparent px-8 sticky top-0 z-10">
            <span className="text-[15px] font-semibold text-foreground">
              {NAV.concat(NAV_SECONDARY).find((n) => n.href === pathname)?.label ?? businessName}
            </span>
            <ThemeToggle />
          </header>
          <main className="flex-1 p-8 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
