"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Save, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        setConfigs(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const promises = Object.entries(configs).map(([key, value]) =>
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value })
        })
      );
      await Promise.all(promises);
      setMessage({ type: "success", text: "Settings saved successfully." });
    } catch (err) {
      setMessage({ type: "error", text: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleFactoryReset = async () => {
    if (!window.confirm("WARNING: This will permanently delete ALL operational data (trips, bookings, payments, marketing facts). Reference data will be preserved. Are you absolutely sure?")) {
      return;
    }
    
    setWiping(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/factory-reset", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: "success", text: json.message });
      } else {
        setMessage({ type: "error", text: json.error || "Reset failed." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Failed to factory reset database." });
    } finally {
      setWiping(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setConfigs(prev => ({ ...prev, [key]: value }));
  };

  const SETTING_FIELDS = [
    { key: "BASE_TICKET_PRICE", label: "Base Ticket Price (INR)", type: "number" },
    { key: "HIGH_OCCUPANCY_THRESHOLD", label: "High Occupancy Threshold (%)", type: "number", step: "0.01" },
    { key: "LOW_OCCUPANCY_THRESHOLD", label: "Low Occupancy Threshold (%)", type: "number", step: "0.01" },
  ];

  if (loading) return <div className="p-8 text-foreground-muted">Loading settings...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings & Assumptions</h1>
          <p className="text-foreground-muted mt-2">Manage global business assumptions and system configurations.</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <p className="font-medium">{message.text}</p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        <div className="glass-panel p-6 rounded-xl space-y-6">
          <h2 className="text-xl font-semibold text-foreground border-b border-border/50 pb-4">Pricing Rules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SETTING_FIELDS.map(field => (
              <div key={field.key} className="space-y-2">
                <label className="text-sm font-medium text-foreground-muted">{field.label}</label>
                <input
                  type={field.type}
                  step={field.step}
                  value={configs[field.key] || ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full bg-background border border-border/50 rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  placeholder="Not set"
                />
              </div>
            ))}
          </div>
          
          <div className="pt-4 flex justify-end">
            <button 
              type="submit" 
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </form>

      <div className="glass-panel p-6 rounded-xl border border-red-500/20 bg-red-500/5 space-y-4">
        <h2 className="text-xl font-semibold text-red-500">Danger Zone</h2>
        <p className="text-sm text-foreground-muted">
          Permanently wipe all operational data (trips, bookings, revenue) to prepare the system for production. 
          Core reference data (vessels, routes, configuration) will remain intact.
        </p>
        <button 
          onClick={handleFactoryReset}
          disabled={wiping}
          className="flex items-center gap-2 px-6 py-2.5 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg font-medium transition-all disabled:opacity-50 mt-4"
        >
          <Trash2 size={18} />
          {wiping ? "Wiping Database..." : "Factory Reset Database"}
        </button>
      </div>
    </div>
  );
}
