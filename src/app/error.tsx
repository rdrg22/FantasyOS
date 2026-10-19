"use client";

import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-16 max-w-lg p-6 text-center">
      <AlertTriangle className="mx-auto mb-3 text-down" />
      <h2 className="font-display text-lg font-semibold">Algo ha fallado al cargar esta sección</h2>
      <p className="mt-2 text-sm text-muted">{error.message || "Error inesperado."}</p>
      {error.digest && <p className="mt-1 font-mono text-[11px] text-dim">ref: {error.digest}</p>}
      <button className="btn-primary mt-4" onClick={reset}>Reintentar</button>
    </div>
  );
}
