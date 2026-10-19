/** Minigráfica SVG sin dependencias (rápida en tablas largas). */
export function Sparkline({ data, width = 90, height = 28 }: { data: { value: number }[]; width?: number; height?: number }) {
  if (data.length < 2) return <span className="text-[11px] text-dim">sin histórico</span>;
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`);
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? "#22c55e" : "#f43f5e";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={`1,${height} ${pts.join(" ")} ${width - 1},${height}`} fill={color} opacity={0.12} stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
