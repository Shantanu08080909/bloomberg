export function Breadth({ data, label }: { data: { advancers: number; decliners: number; unchanged: number; constituents: number; covered: number } | null; label: string }) {
  if (!data) return <p className="text-[12px] text-muted">Market breadth unavailable: no constituent data for {label}.</p>;
  const total = data.advancers + data.decliners + data.unchanged || 1;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  const ratio = data.decliners > 0 ? (data.advancers / data.decliners).toFixed(2) : "—";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[11.5px]">
        <span className="text-dim">{label}</span>
        <span className="num text-muted">A/D ratio {ratio}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`${data.advancers} advancing, ${data.decliners} declining, ${data.unchanged} unchanged`}>
        <div className="bg-up" style={{ width: pct(data.advancers) }} />
        <div className="bg-faint" style={{ width: pct(data.unchanged) }} />
        <div className="bg-down" style={{ width: pct(data.decliners) }} />
      </div>
      <div className="num mt-1.5 flex justify-between text-[11px]">
        <span className="text-up">▲ {data.advancers} adv</span>
        <span className="text-muted">{data.unchanged} unch</span>
        <span className="text-down">▼ {data.decliners} dec</span>
      </div>
      {data.covered < data.constituents ? (
        <p className="mt-1 text-[10.5px] text-stale">
          {data.constituents - data.covered} of {data.constituents} constituents have no quote.
        </p>
      ) : null}
    </div>
  );
}
