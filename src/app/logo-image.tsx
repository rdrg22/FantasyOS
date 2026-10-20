// Logo de Fantasy OS para iconos (PNG generados con next/og).
export function LogoImage({ size }: { size: number }) {
  const s = size;
  return (
    <div style={{ width: s, height: s, display: "flex", alignItems: "center", justifyContent: "center", background: "#050a14" }}>
      <svg width={s * 0.62} height={s * 0.62} viewBox="0 0 32 32">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2dd4f0" />
            <stop offset="1" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <path d="M16 2 28 9v14l-12 7L4 23V9z" fill="none" stroke="url(#g)" strokeWidth="2" />
        <path d="M16 9l6 3.5v7L16 23l-6-3.5v-7z" fill="url(#g)" />
        <path d="M8 22l5-5 3 3 7-8" fill="none" stroke="#050a14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
