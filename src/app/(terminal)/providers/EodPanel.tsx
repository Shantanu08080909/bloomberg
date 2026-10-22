"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Download, FileUp, Loader2, RefreshCw } from "lucide-react";
import { Badge, buttonClass, Callout, Field, inputClass } from "@/components/ui";
import { apiFetch, useApi } from "@/lib/client/api";
import { cn } from "@/lib/cn";

interface Status {
  activeSource: string;
  owner: boolean;
  summary: { exchange: string; instruments: number; bars: number; firstDate: string; lastDate: string }[];
  lastOfficial: { NSE: string | null; BSE: string | null };
  imports: {
    id: number;
    format: string;
    exchange: string | null;
    origin: string;
    mode: string;
    fileName: string;
    sha256: string;
    sourceUrl: string | null;
    tradeDateFrom: string | null;
    tradeDateTo: string | null;
    rowsRead: number;
    rowsAccepted: number;
    rowsRejected: number;
    barsWritten: number;
    status: string;
    message: string | null;
    importedAt: string;
  }[];
  download: { enabled: boolean; exchanges: string[]; maxDaysPerRun: number; publishAfterIst: string };
  tej: { enabled: boolean };
}

interface Outcome {
  exchange: string;
  date: string;
  kind: string;
  status: string;
  message: string;
  bars?: number;
}

const fmt = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const statusTone = (s: string) => (s === "success" || s === "imported" ? "up" : s === "error" || s === "blocked" ? "down" : s === "running" ? "info" : "neutral") as "up" | "down" | "info" | "neutral";

export function EodPanel() {
  const router = useRouter();
  const { data, error, refresh } = useApi<Status>("/api/eod/status");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [force, setForce] = useState(false);
  const [bf, setBf] = useState({ exchange: "BSE", from: "", to: "" });
  const [tej, setTej] = useState({ exchange: "NSE", year: String(new Date().getFullYear()) });
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    setOutcomes([]);
    try {
      await fn();
      refresh();
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    await run("upload", async () => {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("files", f);
      if (force) form.append("force", "true");
      const res = await fetch("/api/eod/import", { method: "POST", body: form, credentials: "same-origin" });
      const body = (await res.json()) as { error?: string; results?: { fileName: string; status: string; message: string; dates: string[] }[] };
      if (!res.ok) throw new Error(body.error ?? `Import failed (${res.status})`);
      setOutcomes((body.results ?? []).map((r) => ({ exchange: "", date: r.dates.length ? `${r.dates[0]}${r.dates.length > 1 ? ` → ${r.dates.at(-1)}` : ""}` : "", kind: r.fileName, status: r.status, message: r.message })));
      const ok = (body.results ?? []).filter((r) => r.status === "success").length;
      setMsg({ ok: ok > 0, text: `${ok} of ${body.results?.length ?? 0} file(s) imported` });
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  const owner = data?.owner ?? false;

  return (
    <section className="rounded-panel border border-line bg-panel" id="eod">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">End-of-day market data (NSE / BSE)</h2>
        {data ? <Badge tone={data.activeSource === "eod" ? "up" : "demo"}>{data.activeSource === "eod" ? "in use" : "demo mode"}</Badge> : null}
        <button type="button" onClick={refresh} className="ml-auto rounded p-1 text-faint hover:text-fg" aria-label="Reload status">
          <RefreshCw className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-3 p-3">
        {error ? <Callout tone="error">{error}</Callout> : null}

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded border border-line bg-panel-2 p-3 lg:col-span-1">
            <div className="mb-1.5 text-[11px] uppercase tracking-[0.05em] text-muted">Stored data</div>
            {data?.summary.length ? (
              <table className="w-full text-[12px]">
                <tbody>
                  {data.summary.map((s) => (
                    <tr key={s.exchange}>
                      <td className="py-0.5 font-semibold text-fg">{s.exchange}</td>
                      <td className="num py-0.5 text-right text-dim">{s.instruments.toLocaleString("en-IN")} instr.</td>
                      <td className="num py-0.5 text-right text-dim">{s.bars.toLocaleString("en-IN")} bars</td>
                      <td className="num py-0.5 pl-2 text-right text-[11px] text-muted">
                        {s.firstDate} → {s.lastDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[12px] text-muted">Nothing imported yet — the terminal shows demo data.</p>
            )}
            <p className="mt-2 text-[11px] text-faint">
              Last official file: NSE {data?.lastOfficial.NSE ?? "—"} · BSE {data?.lastOfficial.BSE ?? "—"}
            </p>
          </div>

          <div className="rounded border border-line bg-panel-2 p-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-[0.05em] text-muted">Import files manually</div>
            <p className="mb-2 text-[11.5px] text-dim">
              Official bhavcopy CSV or ZIP from the NSE/BSE report pages (UDiFF or legacy NSE), the NSE index closing file, or a TejHQ yearly <code>.parquet</code>. Re-importing is safe.
            </p>
            <input ref={fileRef} type="file" multiple accept=".csv,.zip,.parquet" disabled={!owner || !!busy} onChange={(e) => upload(e.target.files)} className="hidden" id="eod-files" />
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="eod-files" className={cn(buttonClass("primary", "sm"), (!owner || busy) && "pointer-events-none opacity-50")}>
                {busy === "upload" ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />} Choose files…
              </label>
              <label className="flex items-center gap-1.5 text-[11.5px] text-muted" title="Re-process files even if an identical file was imported before">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="accent-[var(--color-accent)]" />
                Re-process duplicates
              </label>
            </div>
          </div>

          <div className="rounded border border-line bg-panel-2 p-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-[0.05em] text-muted">Automated download</div>
            {data?.download.enabled ? (
              <>
                <p className="mb-2 text-[11.5px] text-dim">
                  Enabled for {data.download.exchanges.join(" and ")}. The scheduler fetches new sessions daily after {data.download.publishAfterIst} IST while the server runs.
                </p>
                <button type="button" disabled={!owner || !!busy} className={buttonClass("default", "sm")} onClick={() => run("update", async () => {
                  const r = await apiFetch<{ outcomes: Outcome[] }>("/api/eod/update", { method: "POST" });
                  setOutcomes(r.outcomes);
                  setMsg({ ok: true, text: r.outcomes.length ? `${r.outcomes.filter((o) => o.status === "imported").length} file(s) imported` : "Already up to date" });
                })}>
                  {busy === "update" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Update now
                </button>
              </>
            ) : (
              <p className="text-[11.5px] text-dim">
                Off. Set <code>EOD_DOWNLOAD_ENABLED=true</code> in <code>.env.local</code> after reviewing the exchanges&apos; terms of use, then restart. Manual import always works.
              </p>
            )}
          </div>
        </div>

        {data?.download.enabled ? (
          <form
            className="flex flex-wrap items-end gap-2 rounded border border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run("backfill", async () => {
                const r = await apiFetch<{ outcomes: Outcome[] }>("/api/eod/backfill", { body: bf });
                setOutcomes(r.outcomes);
                setMsg({ ok: true, text: `${r.outcomes.filter((o) => o.status === "imported").length} file(s) imported` });
              });
            }}
          >
            <span className="w-full text-[11px] uppercase tracking-[0.05em] text-muted">Historical backfill (max {data.download.maxDaysPerRun} trading days per run)</span>
            <Field label="Exchange" htmlFor="bf-ex">
              <select id="bf-ex" value={bf.exchange} onChange={(e) => setBf({ ...bf, exchange: e.target.value })} className={cn(inputClass, "h-7 w-28")}>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
                <option value="BOTH">Both</option>
              </select>
            </Field>
            <Field label="From" htmlFor="bf-from">
              <input id="bf-from" type="date" required value={bf.from} onChange={(e) => setBf({ ...bf, from: e.target.value })} className={cn(inputClass, "h-7 w-40")} />
            </Field>
            <Field label="To" htmlFor="bf-to">
              <input id="bf-to" type="date" required value={bf.to} onChange={(e) => setBf({ ...bf, to: e.target.value })} className={cn(inputClass, "h-7 w-40")} />
            </Field>
            <button type="submit" className={buttonClass("default", "sm")} disabled={!owner || !!busy}>
              {busy === "backfill" ? <Loader2 className="size-3.5 animate-spin" /> : null} Run backfill
            </button>
            <span className="text-[11px] text-faint">Files are fetched about one every 3 seconds; large ranges take a while. For years of history use the command line.</span>
          </form>
        ) : null}

        {data?.tej.enabled ? (
          <form
            className="flex flex-wrap items-end gap-2 rounded border border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run("tej", async () => {
                const r = await apiFetch<{ results: { status: string; message: string; fileName: string; dates: string[] }[] }>("/api/eod/tej", { body: { exchange: tej.exchange, year: Number(tej.year) } });
                setOutcomes(r.results.map((x) => ({ exchange: tej.exchange, date: x.dates.length ? `${x.dates[0]} → ${x.dates.at(-1)}` : "", kind: x.fileName, status: x.status, message: x.message })));
                setMsg({ ok: r.results.some((x) => x.status === "success"), text: "TejHQ archive processed" });
              });
            }}
          >
            <span className="w-full text-[11px] uppercase tracking-[0.05em] text-muted">TejHQ archive (third-party; labelled HISTORICAL; never overrides official files)</span>
            <Field label="Exchange" htmlFor="tej-ex">
              <select id="tej-ex" value={tej.exchange} onChange={(e) => setTej({ ...tej, exchange: e.target.value })} className={cn(inputClass, "h-7 w-28")}>
                <option value="NSE">NSE (2010→)</option>
                <option value="BSE">BSE (2024-07→)</option>
              </select>
            </Field>
            <Field label="Year" htmlFor="tej-year">
              <input id="tej-year" type="number" min={2010} max={2100} value={tej.year} onChange={(e) => setTej({ ...tej, year: e.target.value })} className={cn(inputClass, "h-7 w-24")} />
            </Field>
            <button type="submit" className={buttonClass("default", "sm")} disabled={!owner || !!busy}>
              {busy === "tej" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download and import year
            </button>
            <span className="text-[11px] text-faint">About 15 MB and 1–2 minutes per exchange-year.</span>
          </form>
        ) : null}

        {!owner && data ? <Callout tone="info">Only the owner account can import or download market data.</Callout> : null}
        {msg ? <Callout tone={msg.ok ? "info" : "error"}>{msg.text}</Callout> : null}
        {outcomes.length ? (
          <div className="max-h-64 overflow-auto rounded border border-line">
            <table className="data-table">
              <tbody>
                {outcomes.map((o, i) => (
                  <tr key={i}>
                    <td>{o.exchange}</td>
                    <td className="num">{o.date}</td>
                    <td className="text-muted">{o.kind}</td>
                    <td>
                      <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                    </td>
                    <td className="whitespace-normal text-[11.5px] text-dim">{o.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.05em] text-muted">Import history (provenance)</div>
          <div className="max-h-80 overflow-auto rounded border border-line">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Imported (IST)</th>
                  <th>File</th>
                  <th>Format</th>
                  <th>Mode</th>
                  <th>Sessions</th>
                  <th className="r">Rows ok</th>
                  <th className="r">Rejected</th>
                  <th className="r">Bars</th>
                  <th>Status</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {(data?.imports ?? []).map((r) => (
                  <tr key={r.id} title={r.message ?? undefined}>
                    <td className="num text-faint">{r.id}</td>
                    <td className="num text-[11.5px]">{fmt(r.importedAt)}</td>
                    <td className="max-w-[240px] truncate text-[11.5px]" title={r.sourceUrl ?? r.fileName}>
                      {r.sourceUrl ? (
                        <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          {r.fileName}
                        </a>
                      ) : (
                        r.fileName
                      )}
                    </td>
                    <td className="text-[11.5px] text-muted">{r.format}</td>
                    <td>
                      <Badge tone={r.mode === "archive" || r.mode === "backfill" ? "info" : "neutral"}>{r.mode}</Badge>
                    </td>
                    <td className="num text-[11.5px] text-muted">{r.tradeDateFrom ? (r.tradeDateFrom === r.tradeDateTo ? r.tradeDateFrom : `${r.tradeDateFrom} → ${r.tradeDateTo}`) : "—"}</td>
                    <td className="r num">{r.rowsAccepted.toLocaleString("en-IN")}</td>
                    <td className={cn("r num", r.rowsRejected > 0 && "text-stale")}>{r.rowsRejected}</td>
                    <td className="r num">{r.barsWritten.toLocaleString("en-IN")}</td>
                    <td>
                      <Badge tone={statusTone(r.status)} title={r.message ?? undefined}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="num text-[10.5px] text-faint" title={r.sha256}>
                      {r.sha256.slice(0, 10)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.imports.length === 0 ? <p className="px-3 py-6 text-center text-[12px] text-muted">No imports yet.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
