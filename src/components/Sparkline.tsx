/** Tiny inline SVG trend line (server-renderable). */
export function Sparkline({ values, width = 96, height = 28, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden className={className} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`);
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className={className}>
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "#3fb17d" : "#e0605a"} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
