/**
 * End-of-day market data command line.
 *
 *   npm run eod -- status
 *   npm run eod -- import <file-or-folder>... [--force]       official CSV/ZIP or TejHQ parquet
 *   npm run eod -- update                                    sessions since the last import (EOD_DOWNLOAD_ENABLED=true)
 *   npm run eod -- backfill --exchange NSE|BSE|both --from YYYY-MM-DD --to YYYY-MM-DD
 *   npm run eod -- tej --exchange NSE|BSE --year 2026 [--from YYYY-MM-DD]   (TEJ_ARCHIVE_ENABLED=true)
 *
 * With the embedded database, stop the web server first (one process at a time).
 * Re-running any command is safe: imports are idempotent.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./load-env";
loadEnv();

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function collect(p: string, out: string[] = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p).sort()) collect(path.join(p, e), out);
  } else if (/\.(csv|zip|parquet)$/i.test(p)) out.push(p);
  return out;
}

const isoOk = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function main() {
  const [cmd, ...rest] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(i > 0 && all[i - 1]!.startsWith("--")));
  const { createDb } = await import("../src/lib/db/client");
  const { setupDatabase } = await import("../src/lib/db/seed");
  const imp = await import("../src/lib/eod/importer");
  const dl = await import("../src/lib/eod/download");
  const handle = await createDb();
  try {
    await setupDatabase(handle);
    const db = handle.db;
    const printOutcome = (o: { exchange: string; date: string; kind: string; status: string; message: string }) =>
      console.log(`  ${o.exchange} ${o.date || "-"} ${o.kind.padEnd(6)} ${o.status.padEnd(8)} ${o.message}`);

    switch (cmd) {
      case "status": {
        const sum = await imp.eodSummary(db);
        if (sum.length === 0) console.log("No end-of-day data imported yet. The terminal runs in demo mode.");
        for (const s of sum) console.log(`${s.exchange.padEnd(6)} ${String(s.instruments).padStart(6)} instruments ${String(s.bars).padStart(9)} bars  ${s.firstDate} → ${s.lastDate}`);
        console.log(`Last official session: NSE ${(await imp.lastOfficialDate(db, "NSE")) ?? "—"}, BSE ${(await imp.lastOfficialDate(db, "BSE")) ?? "—"}`);
        const recent = await imp.listImports(db, 10);
        if (recent.length) console.log("\nRecent imports:");
        for (const r of recent) console.log(`  #${r.id} ${r.importedAt.toISOString()} ${r.status.padEnd(7)} ${r.format.padEnd(11)} ${r.mode.padEnd(8)} ${r.fileName} — ${r.message ?? ""}`);
        break;
      }
      case "import": {
        if (rest.length === 0) throw new Error("Give one or more files or folders to import");
        const files = rest.flatMap((p) => collect(path.resolve(p)));
        if (files.length === 0) throw new Error("No .csv, .zip or .parquet files found");
        console.log(`Importing ${files.length} file(s)…`);
        let touched: number[] = [];
        for (const f of files) {
          const res = await imp.importFiles(db, [{ name: path.basename(f), bytes: new Uint8Array(fs.readFileSync(f)) }], { mode: (arg("mode") as "manual" | "backfill") ?? "manual", force: flag("force"), deferRefresh: true });
          for (const r of res) {
            console.log(`  ${r.status.padEnd(7)} ${r.fileName}: ${r.message}${r.dates.length ? ` [${r.dates[0]}${r.dates.length > 1 ? ` → ${r.dates.at(-1)}` : ""}]` : ""}`);
            for (const x of r.rejectedSample.slice(0, 3)) console.log(`           rejected line ${x.line}: ${x.reason}`);
            touched = touched.concat(r.instrumentIds);
          }
        }
        if (touched.length) {
          console.log("Rebuilding quotes and technical snapshots…");
          await imp.refreshDerived(db, touched);
        }
        break;
      }
      case "update": {
        const ex = (arg("exchange")?.toUpperCase() === "BOTH" || !arg("exchange") ? ["NSE", "BSE"] : [arg("exchange")!.toUpperCase()]) as ("NSE" | "BSE")[];
        await dl.dailyUpdate(db, ex, { onProgress: printOutcome });
        break;
      }
      case "backfill": {
        const from = arg("from");
        const to = arg("to");
        if (!isoOk(from) || !isoOk(to)) throw new Error("Use --from YYYY-MM-DD --to YYYY-MM-DD");
        const e = (arg("exchange") ?? "both").toUpperCase();
        const exchanges = (e === "BOTH" ? ["NSE", "BSE"] : [e]) as ("NSE" | "BSE")[];
        await dl.downloadRange(db, { exchanges, from, to, mode: "backfill", onProgress: printOutcome });
        break;
      }
      case "tej": {
        const e = (arg("exchange") ?? "").toUpperCase();
        const year = Number(arg("year"));
        if ((e !== "NSE" && e !== "BSE") || !Number.isInteger(year)) throw new Error("Use --exchange NSE|BSE --year YYYY");
        console.log(`Downloading TejHQ ${e} ${year} archive…`);
        const res = await dl.importTejYear(db, e, year, { from: arg("from") });
        for (const r of res) console.log(`  ${r.status}: ${r.message} [${r.dates[0] ?? ""} → ${r.dates.at(-1) ?? ""}]`);
        break;
      }
      default:
        console.log("Commands: status | import <paths…> [--force] | update | backfill --exchange NSE|BSE|both --from D --to D | tej --exchange NSE|BSE --year Y");
        process.exitCode = cmd ? 1 : 0;
    }
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
