"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, FolderOpen, CheckCircle2, XCircle, FileSpreadsheet, Loader2, PackagePlus } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Callout,
  EmptyState,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui";
import type { TripFolderCandidate, ImportResult } from "@/server/domain/import/types";
import type { TodaysPackageResult } from "@/server/domain/templates";

type LoadState = "idle" | "loading" | "error";

export function ImportWorkflow() {
  const [candidates, setCandidates] = useState<TripFolderCandidate[]>([]);
  const [scanState, setScanState] = useState<LoadState>("loading");
  const [scanError, setScanError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<TodaysPackageResult | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Deliberately does not set "loading" state up front: the initial mount
  // effect below relies on scanState's own initial value ("loading") so it
  // never calls setState synchronously within the effect body. The manual
  // "Re-scan" button sets "loading" itself (from an event handler) before
  // calling this.
  const runScan = useCallback(async () => {
    try {
      const res = await fetch("/api/import/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to scan the Incoming folder.");
      setCandidates(data.candidates ?? []);
      setScanState("idle");
      setScanError(null);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
      setScanState("error");
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is intentional: data/incoming/ is live filesystem
    // state that must be re-read on every visit, not something a Server
    // Component could precompute ahead of time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runScan();
  }, [runScan]);

  function handleRescan() {
    setScanState("loading");
    setScanError(null);
    runScan();
  }

  async function handleImportAll() {
    setImporting(true);
    setImportError(null);
    setResults(null);
    try {
      const res = await fetch("/api/import/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed unexpectedly.");
      setResults(data.results ?? []);
      await runScan();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function handleGenerateToday() {
    setGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    try {
      const res = await fetch("/api/templates/generate-today", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate today's trip package.");
      setGenerateResult(data);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  const committedCount = results?.filter((r) => r.status === "committed").length ?? 0;
  const failedCount = results?.filter((r) => r.status === "failed").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleGenerateToday} disabled={generating} variant="secondary">
          {generating ? <Loader2 size={15} className="animate-spin" /> : <PackagePlus size={15} />}
          Generate Today&apos;s Trip Package
        </Button>
        <Button onClick={handleRescan} disabled={scanState === "loading"} variant="outline">
          <RefreshCw size={15} className={scanState === "loading" ? "animate-spin" : ""} />
          Re-scan Incoming
        </Button>
        <Button onClick={handleImportAll} disabled={importing || candidates.length === 0}>
          {importing ? <Loader2 size={15} className="animate-spin" /> : <FolderOpen size={15} />}
          Import All ({candidates.length})
        </Button>
      </div>

      {generateError && <Callout tone="danger" title="Couldn't generate today's package">{generateError}</Callout>}
      {generateResult && (
        <Callout tone="success" title="Today's trip package is ready">
          Generated {generateResult.trips.length} trip folder{generateResult.trips.length === 1 ? "" : "s"} for{" "}
          {generateResult.tripDate} under <code className="text-[12px]">data/generated/</code>. Print or hand these to
          crew, then drop the completed versions into Incoming when the day is done.
        </Callout>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Waiting in Incoming</CardTitle>
            <CardDescription>Completed trip folders ready to be validated and imported.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {scanState === "error" && <Callout tone="danger" title="Couldn't read the Incoming folder">{scanError}</Callout>}

          {scanState === "loading" && candidates.length === 0 && (
            <p className="flex items-center gap-2 text-[13px] text-foreground-muted">
              <Loader2 size={14} className="animate-spin" /> Scanning data/incoming...
            </p>
          )}

          {scanState !== "error" && scanState !== "loading" && candidates.length === 0 && (
            <EmptyState
              icon={<FolderOpen size={28} />}
              title="Nothing waiting to be imported"
              description="Once a manager copies a completed trip folder into data/incoming/, it will show up here for review before import."
            />
          )}

          {candidates.length > 0 && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Trip Folder</TableHeaderCell>
                  <TableHeaderCell>Workbooks Present</TableHeaderCell>
                  <TableHeaderCell>File Count</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.folderPath}>
                    <TableCell className="font-medium">{c.tripId}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {c.files.length === 0 ? (
                          <span className="text-foreground-faint">no .xlsx files found</span>
                        ) : (
                          c.files.map((f) => (
                            <Badge key={f} tone="neutral">
                              <FileSpreadsheet size={11} /> {f}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{c.files.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {importError && <Callout tone="danger" title="Import failed unexpectedly">{importError}</Callout>}

      {results && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Import Results</CardTitle>
              <CardDescription>
                {committedCount} imported successfully, {failedCount} failed.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.length === 0 && <p className="text-[13px] text-foreground-muted">Nothing to import.</p>}
            {results.map((r) => (
              <div
                key={r.folderPath}
                className="rounded-[var(--radius-md)] border border-border-subtle p-4"
              >
                <div className="flex items-center gap-2">
                  {r.status === "committed" ? (
                    <CheckCircle2 size={16} className="text-success" />
                  ) : (
                    <XCircle size={16} className="text-danger" />
                  )}
                  <span className="font-medium text-foreground">{r.tripId}</span>
                  <Badge tone={r.status === "committed" ? "success" : "danger"}>{r.status}</Badge>
                  {r.batchId && <span className="text-[12px] text-foreground-faint">batch {r.batchId}</span>}
                </div>

                {r.status === "committed" && (
                  <p className="mt-2 text-[13px] text-foreground-muted">
                    Data saved to the database. Original workbooks moved to the read-only archive.
                    {r.archivedFiles && r.archivedFiles.length > 0 && ` (${r.archivedFiles.length} files archived.)`}
                  </p>
                )}

                {r.status === "failed" && (
                  <>
                    <p className="mt-2 text-[13px] font-medium text-danger">
                      Nothing was written to the database — the original files are still in Incoming, untouched.
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {r.issues.map((issue, i) => (
                        <li key={i} className="text-[13px] text-foreground-muted">
                          <span className="font-medium text-foreground">{issue.fileName}</span>
                          {issue.sheetName && <span> ({issue.sheetName})</span>}: {issue.errorMessage}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
