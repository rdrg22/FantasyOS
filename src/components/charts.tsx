"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact, fmtMoney } from "@/lib/domain/money";

const tooltipStyle = {
  background: "#0b1526",
  border: "1px solid #1f3150",
  borderRadius: 10,
  fontSize: 12,
  color: "#e7eef9",
};

export function PriceChart({ data }: { data: { label: string; value: number; kind: string }[] }) {
  if (data.length < 2) return <div className="flex h-48 items-center justify-center text-sm text-muted">Aún no hay histórico suficiente para dibujar la tendencia.</div>;
  const up = data[data.length - 1].value >= data[0].value;
  const color = up ? "#22c55e" : "#f43f5e";
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.35} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#16243d" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#5a6a85", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => fmtCompact(v)} tick={{ fill: "#5a6a85", fontSize: 11 }} axisLine={false} tickLine={false} width={52} domain={["auto", "auto"]} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtMoney(Number(v)), "Valor"]} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#pc)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SquadValueChart({ data }: { data: { date: string; squadValue: number; budget: number }[] }) {
  if (data.length < 2)
    return (
      <div className="flex h-56 items-center justify-center text-center text-sm text-muted">La curva aparece a partir del segundo día con datos.</div>
    );
  const rows = data.map((d) => ({ ...d, total: d.squadValue + d.budget, label: d.date.slice(5).split("-").reverse().join("/") }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2dd4f0" stopOpacity={0.35} />
              <stop offset="1" stopColor="#2dd4f0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#16243d" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#5a6a85", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => fmtCompact(v)} tick={{ fill: "#5a6a85", fontSize: 11 }} axisLine={false} tickLine={false} width={52} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v, name) => [fmtMoney(Number(v)), name === "squadValue" ? "Valor plantilla" : name === "total" ? "Patrimonio (plantilla + saldo)" : String(name)]}
          />
          <Area type="monotone" dataKey="squadValue" stroke="#2dd4f0" strokeWidth={2} fill="url(#sv)" />
          <Line type="monotone" dataKey="total" stroke="#f5b82e" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FormationBars({ data, best }: { data: { formation: string; total: number; complete: boolean }[]; best: string }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#16243d" vertical={false} />
          <XAxis dataKey="formation" tick={{ fill: "#8494ad", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#5a6a85", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)} pts esperados`, "Total"]} cursor={{ fill: "rgba(45,212,240,0.06)" }} />
          <Bar dataKey="total" radius={[5, 5, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.formation} fill={d.formation === best ? "#2dd4f0" : d.complete ? "#1f3150" : "#4c0519"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
