import type { Metadata } from "next";
import Link from "next/link";
import { StatementTable } from "@/components/Statements";
import { Callout, Change, DataUnavailable, EmptyState, KeyValue, LinkButton, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { formatISTDate } from "@/lib/dates";
import { securityHref } from "@/lib/dto";
import { median } from "@/lib/finance/stats";
import { fmtCrore, fmtMultiple, fmtNumber, fmtPct, fmtPrice } from "@/lib/format";
import { getActiveSourceId } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { getFundamentals, getInstrumentById, getPeers, getStatements } from "@/lib/services/market";
import { ResearchCharts } from "./ResearchCharts";
import { ResearchPicker } from "./ResearchPicker";

export const metadata: Metadata = { title: "Company Research" };

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id: idParam } = await searchParams;
  const database = await db();
  const id = Number(idParam);
  const inst = Number.isInteger(id) && id > 0 ? await getInstrumentById(database, id) : null;
  const valid = inst && inst.instrumentType !== "INDEX" && inst.sourceId === getActiveSourceId() ? inst : null;

  if (!valid) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader title="Company Research" subtitle="Financial statements, ratio trends and peer comparison for one company." />
        <Panel>
          <div className="max-w-xl">
            <ResearchPicker current={null} />
          </div>
        </Panel>
        <EmptyState title="Choose a company to research">Search by symbol or name above.</EmptyState>
      </div>
    );
  }

  const [f, statements, peers] = await Promise.all([getFundamentals(database, valid.id, valid.sourceId), getStatements(database, valid.id, valid.sourceId), getPeers(database, valid, 12)]);
  const income = statements.filter((s) => s.statementType === "income");
  const balance = new Map(statements.filter((s) => s.statementType === "balance").map((s) => [s.fiscalYear, s.lineItems]));
  const years = income.map((s) => `FY${String(s.fiscalYear).slice(2)}`);
  const revenue = income.map((s) => s.lineItems.revenue ?? null);
  const profit = income.map((s) => s.lineItems.netProfit ?? null);
  const margin = income.map((s) => (s.lineItems.revenue && s.lineItems.netProfit != null ? +((s.lineItems.netProfit / s.lineItems.revenue) * 100).toFixed(2) : null));
  const roe = income.map((s) => {
    const eq = balance.get(s.fiscalYear)?.totalEquity;
    return eq && s.lineItems.netProfit != null ? +((s.lineItems.netProfit / eq) * 100).toFixed(2) : null;
  });
  const cagr = (xs: (number | null)[]) => {
    const a = xs[0];
    const b = xs[xs.length - 1];
    return a && b && a > 0 && b > 0 && xs.length > 1 ? ((b / a) ** (1 / (xs.length - 1)) - 1) * 100 : null;
  };
  const peerPe = median(peers.map((p) => p.f?.pe).filter((x): x is number => x != null && x > 0));
  const peerPb = median(peers.map((p) => p.f?.pb).filter((x): x is number => x != null && x > 0));

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Company Research"
        subtitle={`${valid.name} · ${valid.sector ?? "—"} · ${valid.industry ?? ""}`}
        status={<StatusBadge status={valid.displayStatus} />}
        actions={
          <>
            <LinkButton href={securityHref(valid.exchange, valid.symbol)} size="sm">
              Quote & chart
            </LinkButton>
            <LinkButton href={`/valuation?id=${valid.id}`} size="sm" variant="primary">
              Value in Valuation Lab
            </LinkButton>
          </>
        }
      />
      <Panel>
        <div className="max-w-xl">
          <ResearchPicker current={{ id: valid.id, symbol: valid.symbol, exchange: valid.exchange, name: valid.name }} />
        </div>
      </Panel>
      {valid.displayStatus === "demo" ? <Callout tone="demo">Fictional company. All statements and ratios below are synthetic demo values.</Callout> : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Growth & profitability">
          {income.length ? <ResearchCharts years={years} revenue={revenue} profit={profit} margin={margin} roe={roe} /> : <DataUnavailable what="Financial statements" />}
        </Panel>
        <Panel title="Snapshot" footer={f ? `As of ${formatISTDate(f.asOf)}` : undefined}>
          <KeyValue
            rows={[
              ["Price", fmtPrice(valid.quote?.price)],
              ["Market cap", fmtCrore(f?.marketCapCr)],
              ["P/E · sector median", `${fmtMultiple(f?.pe)} · ${fmtMultiple(peerPe)}`],
              ["P/B · sector median", `${fmtMultiple(f?.pb)} · ${fmtMultiple(peerPb)}`],
              ["EPS", f?.eps != null ? `₹${fmtNumber(f.eps)}` : "—"],
              ["Book value / share", f?.bookValuePerShare != null ? `₹${fmtNumber(f.bookValuePerShare)}` : "—"],
              ["ROE", fmtPct(f?.roe, 2, false)],
              ["Debt / equity", f?.debtToEquity != null ? fmtMultiple(f.debtToEquity, 2) : "n/a"],
              ["Dividend yield", fmtPct(f?.dividendYield, 2, false)],
              [`Revenue CAGR (${Math.max(0, income.length - 1)}y)`, <Change key="c1" pct={cagr(revenue)} />],
              [`Profit CAGR (${Math.max(0, income.length - 1)}y)`, <Change key="c2" pct={cagr(profit)} />],
            ]}
          />
        </Panel>
      </div>

      <Panel title="Income statement" bodyClassName="p-0">
        <StatementTable rows={statements} type="income" title="Income statement" />
      </Panel>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Balance sheet" bodyClassName="p-0">
          <StatementTable rows={statements} type="balance" title="Balance sheet" />
        </Panel>
        <Panel title="Cash flow" bodyClassName="p-0">
          <StatementTable rows={statements} type="cashflow" title="Cash flow statement" />
        </Panel>
      </div>

      <Panel title={`Peer comparison — ${valid.sector ?? ""} (${valid.exchange})`} bodyClassName="p-0 overflow-x-auto">
        {peers.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th className="r">Price</th>
                <th className="r">Chg %</th>
                <th className="r">Mkt cap</th>
                <th className="r">P/E</th>
                <th className="r">P/B</th>
                <th className="r">ROE</th>
                <th className="r">D/E</th>
                <th className="r">Div yield</th>
                <th className="r">Rev growth</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-accent-soft/40">
                <td className="font-semibold text-fg">
                  {valid.symbol} <span className="text-[10px] text-accent">this company</span>
                </td>
                <td className="r num">{fmtPrice(valid.quote?.price)}</td>
                <td className="r num">
                  <Change pct={valid.quote?.changePct} />
                </td>
                <td className="r num">{fmtCrore(f?.marketCapCr)}</td>
                <td className="r num">{fmtMultiple(f?.pe)}</td>
                <td className="r num">{fmtMultiple(f?.pb)}</td>
                <td className="r num">{fmtPct(f?.roe, 1, false)}</td>
                <td className="r num">{f?.debtToEquity != null ? fmtMultiple(f.debtToEquity, 2) : "—"}</td>
                <td className="r num">{fmtPct(f?.dividendYield, 2, false)}</td>
                <td className="r num">
                  <Change pct={f?.revenueGrowth} />
                </td>
              </tr>
              {peers.map((p) => (
                <tr key={p.instrument.id}>
                  <td>
                    <Link href={`/research?id=${p.instrument.id}`} className="num font-semibold text-accent-strong hover:underline">
                      {p.instrument.symbol}
                    </Link>
                    <span className="ml-1.5 text-[11px] text-faint">{p.instrument.name}</span>
                  </td>
                  <td className="r num">{fmtPrice(p.quote?.price)}</td>
                  <td className="r num">
                    <Change pct={p.quote?.changePct} />
                  </td>
                  <td className="r num">{fmtCrore(p.f?.marketCapCr)}</td>
                  <td className="r num">{fmtMultiple(p.f?.pe)}</td>
                  <td className="r num">{fmtMultiple(p.f?.pb)}</td>
                  <td className="r num">{fmtPct(p.f?.roe, 1, false)}</td>
                  <td className="r num">{p.f?.debtToEquity != null ? fmtMultiple(p.f.debtToEquity, 2) : "—"}</td>
                  <td className="r num">{fmtPct(p.f?.dividendYield, 2, false)}</td>
                  <td className="r num">
                    <Change pct={p.f?.revenueGrowth} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-3 py-4 text-[12px] italic text-faint">No peers in the active dataset.</p>
        )}
      </Panel>
    </div>
  );
}
