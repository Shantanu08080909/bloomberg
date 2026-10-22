/**
 * Test fixtures with the official column layouts and INVENTED values.
 * Nothing here is real market data.
 */
export const UDIFF_HEADER =
  "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4";

export interface FixtureRow {
  date: string;
  src?: "NSE" | "BSE";
  sgmt?: string;
  type?: string;
  id?: string;
  isin?: string;
  symbol: string;
  series?: string;
  name?: string;
  o: number;
  h: number;
  l: number;
  c: number;
  prev?: number;
  vol: number;
  val?: number;
  trades?: number;
}

export function udiffCsv(rows: FixtureRow[]) {
  const lines = rows.map((r) =>
    [
      r.date,
      r.date,
      r.sgmt ?? "CM",
      r.src ?? "NSE",
      r.type ?? "STK",
      r.id ?? "1",
      r.isin ?? "",
      r.symbol,
      r.series ?? "EQ",
      "",
      "",
      "",
      "",
      r.name ?? `${r.symbol} TEST LTD`,
      r.o.toFixed(2),
      r.h.toFixed(2),
      r.l.toFixed(2),
      r.c.toFixed(2),
      r.c.toFixed(2),
      (r.prev ?? r.o).toFixed(2),
      "",
      r.c.toFixed(2),
      "",
      "",
      String(r.vol),
      (r.val ?? r.vol * r.c).toFixed(2),
      String(r.trades ?? 10),
      "F1",
      "1",
      "",
      "",
      "",
      "",
      "",
    ].join(","),
  );
  return `${UDIFF_HEADER}\n${lines.join("\n")}\n`;
}

export const LEGACY_HEADER = "SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN,";

export const INDEX_HEADER = "Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value,Points Change,Change(%),Volume,Turnover (Rs. Cr.),P/E,P/B,Div Yield";

export const enc = (s: string) => new TextEncoder().encode(s);
