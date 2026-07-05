"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Settings2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Callout,
  FieldGroup,
  Label,
  Input,
} from "@/components/ui";

const DEFAULTS: Record<string, string> = {
  business_name: "Coral Adventures",
  vessel_port_label: "Malpe, Udupi, Karnataka",
  nps_survey_window_days: "30",
  low_stock_alert_threshold: "10",
};

const FIELDS: Array<{ key: keyof typeof DEFAULTS; label: string; description: string; type: string }> = [
  { key: "business_name", label: "Business Name", description: "Shown across headers and reports.", type: "text" },
  {
    key: "vessel_port_label",
    label: "Vessel / Port Display Name",
    description: "Home port shown alongside the vessel name.",
    type: "text",
  },
  {
    key: "nps_survey_window_days",
    label: "NPS Survey Window (days)",
    description: "Trailing window used when calculating Net Promoter Score.",
    type: "number",
  },
  {
    key: "low_stock_alert_threshold",
    label: "Low Stock Alert Threshold",
    description: "Units remaining at which an inventory item is flagged as low stock.",
    type: "number",
  },
];

export function SettingsForm() {
  const [values, setValues] = useState<Record<string, string>>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        setValues({ ...DEFAULTS, ...data });
      } catch {
        // Fall back to defaults silently — this is a best-effort load.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      for (const field of FIELDS) {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: field.key, value: values[field.key] ?? "" }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? `Failed to save ${field.label}.`);
        }
      }
      setStatus({ tone: "success", message: "Settings saved." });
    } catch (err) {
      setStatus({ tone: "danger", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Business Settings</CardTitle>
          <CardDescription>Stored locally in the app_config table.</CardDescription>
        </div>
        <Settings2 size={18} className="text-foreground-faint" />
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <p className="flex items-center gap-2 text-[13px] text-foreground-muted">
            <Loader2 size={14} className="animate-spin" /> Loading settings...
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <FieldGroup key={field.key}>
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type={field.type}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                  <p className="text-[12px] text-foreground-faint">{field.description}</p>
                </FieldGroup>
              ))}
            </div>

            {status && <Callout tone={status.tone}>{status.message}</Callout>}

            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save Changes
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
