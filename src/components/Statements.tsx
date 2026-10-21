import { fmtNumber } from "@/lib/format";

const LABELS: Record<string, string> = {
  revenue: "Revenue",
  ebitda: "EBITDA",
  depreciation: "Depreciation & amortisation",
  interest: "Finance costs",
  profitBeforeTax: "Profit before tax",
  tax: "Tax",
  netProfit: "Net profit",
  totalAssets: "Total assets",
  cashAndEquivalents: "Cash & equivalents",
  totalEquity: "Total equity",
  totalDebt: "Total debt",
  otherLiabilities: "Other liabilities",
  operatingCashFlow: "Cash from operations",
  capitalExpenditure: "Capital expenditure",
  freeCashFlow: "Free cash flow",
  dividendsPaid: "Dividends paid",
};

export interface StatementRow {
  statementType: string;
  fiscalYear: number;
  unit: string;
  lineItems: Record<string, number | null>;
}

export function StatementTable({ rows, type, title }: { rows: StatementRow[]; type: "income" | "balance" | "cashflow"; title: string }) {
  const list = rows.filter((r) => r.statementType === type).sort((a, b) => a.fiscalYear - b.fiscalYear);
  if (list.length === 0) return <p className="px-3 py-4 text-[12px] italic text-faint">{title}: data unavailable from the active source.</p>;
  const keys = Object.keys(list[list.length - 1]!.lineItems);
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">
              {title} <span className="normal-case text-faint">(₹ {list[0]!.unit})</span>
            </th>
            {list.map((r) => (
              <th key={r.fiscalYear} scope="col" className="r">
                FY{String(r.fiscalYear).slice(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <th scope="row">{LABELS[k] ?? k}</th>
              {list.map((r) => {
                const v = r.lineItems[k];
                return (
                  <td key={r.fiscalYear} className={`r num ${v != null && v < 0 ? "text-down" : ""}`}>
                    {v == null ? <span className="text-faint" title="Not available">n/a</span> : fmtNumber(v, 0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
