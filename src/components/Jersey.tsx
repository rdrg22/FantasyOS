import { useId } from "react";
import { getTeam, type Kit } from "@/lib/domain/teams";

const NEUTRAL: Kit = { pattern: "solid", body: "#3a4f75", alt: "#3a4f75", trim: "#6b7fa3" };

// Silueta de camiseta en un lienzo de 48×48.
const SHIRT =
  "M17 4C19.5 6.6 28.5 6.6 31 4L40 7.5 47 17 40.5 22 37 18.5V44a1 1 0 0 1-1 1H12a1 1 0 0 1-1-1V18.5L7.5 22 1 17 8 7.5Z";
const SLEEVE_L = "M0 0H13L11 19 0 31Z";
const SLEEVE_R = "M48 0H35L37 19 48 31Z";
const CUFF_L = "M1 17 7.5 22 9 20.6 2.6 15.6Z";
const CUFF_R = "M47 17 40.5 22 39 20.6 45.4 15.6Z";

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/** Camiseta del equipo dibujada en SVG (colores aproximados, sin escudos ni marcas). */
export function Jersey({ teamId, size = 32, label, title, className = "" }: { teamId: string | null | undefined; size?: number; label?: string; title?: string; className?: string }) {
  const clip = `kit${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const team = getTeam(teamId);
  const kit = team?.kit ?? NEUTRAL;
  const textFill = isLight(kit.body) ? "#0b1220" : "#ffffff";
  const textStroke = isLight(kit.body) ? "#ffffff" : "#0b1220";
  const stripeW = 26 / 5;

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={`shrink-0 ${className}`} role="img" aria-label={title ?? (team ? `Camiseta ${team.name}` : "Sin equipo")}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clip}>
          <path d={SHIRT} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="48" height="48" fill={kit.body} />
        {kit.pattern === "stripes" &&
          [1, 3].map((i) => <rect key={i} x={11 + stripeW * i} y="0" width={stripeW} height="48" fill={kit.alt} />)}
        {kit.pattern === "band" && <rect x="0" y="19" width="48" height="7" fill={kit.alt} />}
        {kit.pattern === "sash" && <path d="M8 6 15 2 41 40V48H34Z" fill={kit.alt} />}
        <path d={SLEEVE_L} fill={kit.pattern === "stripes" ? kit.alt : kit.body} />
        <path d={SLEEVE_R} fill={kit.pattern === "stripes" ? kit.alt : kit.body} />
        <path d={CUFF_L} fill={kit.trim} />
        <path d={CUFF_R} fill={kit.trim} />
        {/* Sombra lateral para dar volumen */}
        <rect x="30" y="0" width="18" height="48" fill="#000" opacity="0.12" />
      </g>
      <path d="M17 4C19.5 6.6 28.5 6.6 31 4" fill="none" stroke={kit.trim} strokeWidth="2.4" strokeLinecap="round" />
      <path d={SHIRT} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.9" strokeLinejoin="round" />
      {label && (
        <text
          x="24"
          y="31"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={label.length > 2 ? 10 : 13}
          fontWeight="700"
          fontFamily="var(--font-display, system-ui), system-ui, sans-serif"
          fill={textFill}
          stroke={textStroke}
          strokeWidth={kit.pattern === "solid" ? 0 : 2.2}
          paintOrder="stroke"
        >
          {label}
        </text>
      )}
    </svg>
  );
}

/** Iniciales cortas para la camiseta: «Vinícius Júnior» → «VJ», «Pedri» → «PE». */
export function initials(name: string) {
  const parts = name.replace(/[.'’]/g, "").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] ?? "").slice(0, 2).toUpperCase();
}
