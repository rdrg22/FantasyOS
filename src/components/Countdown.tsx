"use client";

import { useEffect, useState } from "react";
import { countdown } from "@/lib/domain/time";

export function Countdown({ to }: { to: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!to) return <>—</>;
  return <>{now == null ? "…" : countdown(to, now)}</>;
}
