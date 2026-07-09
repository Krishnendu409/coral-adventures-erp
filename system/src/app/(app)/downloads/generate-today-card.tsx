"use client";

import { useState } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Callout } from "@/components/ui";
import type { TodaysPackageResult } from "@/server/domain/templates";

export function GenerateTodayCard() {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<TodaysPackageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/templates/generate-today", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate today's trip package.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Generate Today&apos;s Templates</CardTitle>
          <CardDescription>
            Creates today&apos;s trip slots (if missing) and writes the full 7-workbook package for each, ready to
            hand to crew.
          </CardDescription>
        </div>
        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 size={15} className="animate-spin" /> : <PackagePlus size={15} />}
          Generate Today&apos;s Trip Package
        </Button>
      </CardHeader>
      {(result || error) && (
        <CardContent>
          {error && <Callout tone="danger" title="Couldn't generate today's package">{error}</Callout>}
          {result && (
            <Callout tone="success" title="Today's trip package is ready">
              Generated {result.trips.length} trip folder{result.trips.length === 1 ? "" : "s"} for {result.tripDate}{" "}
              under <code className="text-[12px]">data/generated/</code>.
            </Callout>
          )}
        </CardContent>
      )}
    </Card>
  );
}
