import { decodeEntities, ProviderError } from "../http";
import { slugToName } from "../../domain/normalize";
import type { LineupRole } from "../../domain/types";

/**
 * Parser de las páginas de partido de FútbolFantasy ("Previa y posibles alineaciones").
 *  - Hub con enlaces: https://www.futbolfantasy.com/laliga/posibles-alineaciones
 *  - Partido: https://www.futbolfantasy.com/partidos/<id>-<local>-<visitante>
 * Son alineaciones PROBABLES elaboradas por FútbolFantasy, nunca oficiales.
 */

export const FF_LINEUPS_HUB = "https://www.futbolfantasy.com/laliga/posibles-alineaciones";

export interface FfLineupPlayer {
  slug: string;
  normName: string;
  displayName: string;
  role: LineupRole;
  probability: number | null;
  note: string | null;
}

export interface FfMatchLineups {
  home: FfLineupPlayer[];
  away: FfLineupPlayer[];
}

/** Devuelve el enlace más reciente para cada emparejamiento "local-visitante" (ids canónicos). */
export function parseHubLinks(html: string): Map<string, string> {
  const out = new Map<string, { id: number; url: string }>();
  for (const m of html.matchAll(/href="(https:\/\/www\.futbolfantasy\.com\/partidos\/(\d+)-([a-z0-9-]+))"/g)) {
    const id = Number(m[2]);
    const key = m[3];
    const prev = out.get(key);
    if (!prev || id > prev.id) out.set(key, { id, url: m[1] });
  }
  return new Map([...out].map(([k, v]) => [k, v.url]));
}

function sliceBetween(html: string, start: number, end: number) {
  return start >= 0 && end > start ? html.slice(start, end) : "";
}

function wrappers(section: string): FfLineupPlayer[] {
  const out: FfLineupPlayer[] = [];
  const parts = section.split(/<div class="jugador_\d+ campo/).slice(1);
  for (const p of parts) {
    const once = p.match(/data-onceFF="(titular|suplente)"/i);
    const href = p.match(/href="https:\/\/www\.futbolfantasy\.com\/jugadores\/([a-z0-9-]+)\//);
    if (!href) continue;
    const prob = p.match(/data-probabilidad="(\d{1,3})%"/);
    const lesion = p.match(/data-lesion="(-?\d+)"/);
    const shortName = p.match(/class="truncate-name[^"]*">([^<]+)</);
    const injured = lesion && lesion[1] !== "-1";
    let role: LineupRole = once?.[1].toLowerCase() === "titular" ? "titular" : "suplente";
    const probability = prob ? Number(prob[1]) / 100 : null;
    if (injured) role = "lesionado";
    else if (role === "titular" && probability != null && probability < 0.6) role = "duda";
    out.push({
      slug: href[1],
      normName: slugToName(href[1]),
      displayName: shortName ? decodeEntities(shortName[1]).trim() : href[1],
      role,
      probability: injured ? 0 : probability,
      note: injured ? "Marcado como lesionado" : null,
    });
  }
  return out;
}

function statusCards(section: string, role: LineupRole): FfLineupPlayer[] {
  const out: FfLineupPlayer[] = [];
  for (const card of section.split(/class="elemento (?:lesionado|sancionado)[^"]*"/).slice(1)) {
    const link = card.match(/href="https:\/\/www\.futbolfantasy\.com\/jugadores\/([a-z0-9-]+)\/[^"]*" class="jugador">([^<]+)</);
    if (!link) continue;
    const note = card.match(/<span class="lesion">([^<]+)</);
    out.push({
      slug: link[1],
      normName: slugToName(link[1]),
      displayName: decodeEntities(link[2]).trim(),
      role,
      probability: 0,
      note: note ? decodeEntities(note[1]).trim() : null,
    });
  }
  return out;
}

function headerSection(html: string, title: RegExp): string {
  const m = title.exec(html);
  if (!m) return "";
  const from = m.index;
  const next = html.indexOf("<header", from + 10);
  return html.slice(from, next > 0 ? next : from + 20000);
}

export function parseMatchPage(html: string, homeName: string, awayName: string): FfMatchLineups {
  const iLocal = html.indexOf("row-local");
  const iAway = html.indexOf("row-visitante");
  const supl = [...html.matchAll(/campo-wrapper multi-views suplentes/g)].map((m) => m.index!);
  const iStatus = html.indexOf("physical-status-widget");
  if (iLocal < 0 || iAway < 0) throw new ProviderError("FútbolFantasy: la página del partido no tiene el bloque de alineaciones esperado.", "parse");

  const homeXI = wrappers(sliceBetween(html, iLocal, iAway));
  const awayXI = wrappers(sliceBetween(html, iAway, supl[0] ?? iStatus));
  const homeBench = supl.length >= 2 ? wrappers(sliceBetween(html, supl[0], supl[1])) : [];
  const awayBench = supl.length >= 2 ? wrappers(sliceBetween(html, supl[1], iStatus > supl[1] ? iStatus : html.length)) : [];

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const injHome = statusCards(headerSection(html, new RegExp(`>\\s*Lesionados del ${esc(homeName)}\\s*<`)), "lesionado");
  const injAway = statusCards(headerSection(html, new RegExp(`>\\s*Lesionados del ${esc(awayName)}\\s*<`)), "lesionado");
  const sanHome = statusCards(headerSection(html, new RegExp(`>\\s*Sancionados del ${esc(homeName)}\\s*<`)), "sancionado");
  const sanAway = statusCards(headerSection(html, new RegExp(`>\\s*Sancionados del ${esc(awayName)}\\s*<`)), "sancionado");

  const merge = (...lists: FfLineupPlayer[][]) => {
    const m = new Map<string, FfLineupPlayer>();
    for (const l of lists) for (const p of l) {
      const prev = m.get(p.slug);
      // los bloques de lesionados/sancionados prevalecen sobre el campo
      if (!prev || p.role === "lesionado" || p.role === "sancionado") m.set(p.slug, prev && (p.role === "lesionado" || p.role === "sancionado") ? { ...prev, ...p, displayName: prev.displayName } : p);
    }
    return [...m.values()];
  };
  const home = merge(homeXI, homeBench, injHome, sanHome);
  const away = merge(awayXI, awayBench, injAway, sanAway);
  if (homeXI.length < 8 || awayXI.length < 8) {
    throw new ProviderError(`FútbolFantasy: once incompleto (${homeXI.length}/${awayXI.length}). Puede que aún no esté publicado o que la página haya cambiado.`, "parse");
  }
  return { home, away };
}

/** "Getafe - Rayo. Previa y posibles alineaciones..." -> nombres mostrados por la fuente */
export function parseMatchTitle(html: string): { home: string; away: string } | null {
  const m = html.match(/<title>([^<]+?)\s+-\s+([^<.]+?)\.\s*Previa/);
  return m ? { home: decodeEntities(m[1]).trim(), away: decodeEntities(m[2]).trim() } : null;
}
