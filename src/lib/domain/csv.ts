import { normalizeName } from "./normalize";

/** Parser CSV mínimo: detecta ; o , como separador, admite comillas dobles. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return { headers: [], rows: [] };
  const firstLine = clean.split("\n")[0];
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); records.push(row); row = []; field = ""; }
    else field += c;
  }
  row.push(field);
  records.push(row);
  const headers = records[0].map((h) => normalizeName(h));
  const rows = records
    .slice(1)
    .filter((r) => r.some((x) => x.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, rows };
}

/** Devuelve el primer valor presente entre varios nombres de columna posibles. */
export function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[normalizeName(k)];
    if (v != null && v !== "") return v;
  }
  return undefined;
}
