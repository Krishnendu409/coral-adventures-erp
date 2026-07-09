import { AppShell } from "@/components/app-shell";
import { getConfig } from "@/server/domain/settings/configRepository";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const businessName = getConfig("business_name") ?? "Coral Adventures";
  return <AppShell businessName={businessName}>{children}</AppShell>;
}
