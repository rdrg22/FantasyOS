"use client";

import { useEffect, useState } from "react";
import { parseMoney } from "@/lib/domain/normalize";

function parseSigned(text: string, allowNegative: boolean): number | null {
  const t = text.trim();
  if (!t) return null;
  const neg = allowNegative && t.startsWith("-");
  const n = parseMoney(t.replace(/^-/, ""));
  return n == null ? null : neg ? -n : n;
}

/** Campo de importe que acepta "1.250.000", "1,25M" o "750k". */
export function MoneyInput({
  value,
  onChange,
  placeholder = "p. ej. 1.250.000 o 1,25M",
  autoFocus,
  required,
  allowNegative = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState(value != null ? value.toLocaleString("es-ES") : "");
  const invalid = text.trim() !== "" && parseSigned(text, allowNegative) == null;

  // Sincroniza el texto si el valor cambia desde fuera.
  useEffect(() => {
    if (parseSigned(text, allowNegative) !== value) setText(value != null ? value.toLocaleString("es-ES") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <input
        className={`input num ${invalid ? "!border-down/70" : ""}`}
        inputMode="decimal"
        value={text}
        autoFocus={autoFocus}
        required={required}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseSigned(e.target.value, allowNegative));
        }}
        onBlur={() => {
          const n = parseSigned(text, allowNegative);
          if (n != null) setText(n.toLocaleString("es-ES"));
        }}
      />
      {invalid && <p className="mt-1 text-[11.5px] text-down">Importe no válido</p>}
    </div>
  );
}
