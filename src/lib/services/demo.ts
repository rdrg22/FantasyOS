import type { Repo, PlayerInput } from "../db/repo";
import { today } from "../db/repo";
import { TEAMS } from "../domain/teams";
import { addDays, madridToIso } from "../domain/time";
import { formationSlots } from "../domain/formations";
import type { Fixture, PlayerStatus, Position } from "../domain/types";

/**
 * Datos de DEMOSTRACIÓN. Se guardan solo en la base de datos "demo" (fantasy-os-demo.db),
 * con jugadores de nombre ficticio y source = "demo". Nunca se mezclan con los datos reales.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Iker", "Marcos", "Raúl", "Dani", "Hugo", "Adrián", "Pablo", "Sergio", "Javi", "Unai", "Mikel", "Óscar", "Rubén", "Nico", "Bruno", "Gael", "Diego", "Leo", "Mario", "Gonzalo", "Aitor", "Julen", "Teo", "Saúl", "Enzo", "Lucas", "Ander", "Fermín", "Quique", "Borja"];
const LAST = ["Arreche", "Azcue", "Lobato", "Quintela", "Varela", "Montoya", "Salcedo", "Ibarguren", "Calvete", "Rivadulla", "Etxarri", "Molinero", "Pardillo", "Solanes", "Toral", "Urrutikoetxea", "Vidaurre", "Zamorano", "Bermúdez", "Canedo", "Olaizola", "Peñalver", "Garmendia", "Laso", "Echániz", "Ferreiro", "Nogales", "Tamayo", "Yeregui", "Sandoval"];

const LAYOUT: [Position, number][] = [["POR", 2], ["DEF", 5], ["MED", 5], ["DEL", 3], ["ENT", 1]];
const BASE_VALUE: Record<Position, number> = { POR: 6e6, DEF: 6.5e6, MED: 8e6, DEL: 10e6, ENT: 3e6 };

export function seedDemo(repo: Repo, now = new Date()): { players: number; fixtures: number } {
  const db = repo.db;
  const r = rng(20261019);
  const day = today(now);
  const stamp = now.toISOString();
  db.exec(`DELETE FROM players; DELETE FROM player_overrides; DELETE FROM price_snapshots; DELETE FROM squad; DELETE FROM transactions;
           DELETE FROM market_listings; DELETE FROM fixtures; DELETE FROM probable_lineups; DELETE FROM settings;
           DELETE FROM squad_value_history; DELETE FROM sync_log;`);

  // ── Calendario: liga a doble vuelta, la jornada 10 empieza dentro de 4 días ──
  const ids = TEAMS.map((t) => t.id);
  const rounds: [string, string][][] = [];
  const arr = [...ids];
  for (let k = 0; k < 19; k++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < 10; i++) {
      const a = arr[i], b = arr[19 - i];
      pairs.push(k % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  const allRounds = [...rounds, ...rounds.map((p) => p.map(([a, b]) => [b, a] as [string, string]))];
  const strength = new Map(ids.map((id) => [id, 0.6 + r() * 0.9]));
  const fixtures: Fixture[] = [];
  const times = ["21:00", "14:00", "16:15", "18:30", "21:00", "14:00", "16:15", "18:30", "21:00", "21:00"];
  allRounds.forEach((pairs, i) => {
    const md = i + 1;
    const start = addDays(day, (md - 10) * 7 + 4);
    pairs.forEach(([h, a], j) => {
      const date = addDays(start, j === 0 ? 0 : j < 5 ? 1 : j < 9 ? 2 : 3);
      const played = md < 10;
      const sh = strength.get(h)!, sa = strength.get(a)!;
      const goals = (s: number) => Math.min(5, Math.floor(r() * 2.2 * s + (r() < 0.3 ? 1 : 0)));
      fixtures.push({
        id: `demo:${md}:${h}-${a}`,
        season: "demo",
        matchday: md,
        date,
        kickoff: md <= 11 ? madridToIso(date, times[j]) : null,
        homeId: h,
        awayId: a,
        homeScore: played ? goals(sh * 1.1) : null,
        awayScore: played ? goals(sa) : null,
        source: "demo",
        updatedAt: stamp,
      });
    });
  });
  repo.upsertFixtures(fixtures);

  // ── Jugadores ficticios ──
  const players: PlayerInput[] = [];
  const quality = new Map<string, number>();
  const drift = new Map<string, number>();
  let n = 0;
  for (const t of TEAMS) {
    for (const [pos, count] of LAYOUT) {
      for (let k = 0; k < count; k++) {
        n++;
        const name = `${FIRST[n % FIRST.length]} ${LAST[(Math.floor(n / FIRST.length) * 7 + n) % LAST.length]}`; // combinaciones únicas
        const q = Math.max(0.15, Math.min(1, (k === 0 ? 0.75 : k === 1 ? 0.6 : 0.4) * strength.get(t.id)! + r() * 0.35));
        const id = `demo:${n}`;
        quality.set(id, q);
        drift.set(id, (r() - 0.45) * 0.03);
        const value = Math.round((BASE_VALUE[pos] * (0.15 + q * q * 3.2)) / 1000) * 1000;
        const starter = pos === "POR" ? k === 0 : pos === "DEF" ? k < 4 : pos === "MED" ? k < 3 : pos === "DEL" ? k < 3 : true;
        const roll = r();
        const status: PlayerStatus = roll < 0.05 ? "lesionado" : roll < 0.08 ? "duda" : roll < 0.095 ? "sancionado" : "disponible";
        const played5 = starter ? 4 + Math.round(r()) : Math.round(r() * 3);
        const avg = Math.round((1.2 + q * 6 + (r() - 0.5) * 1.5) * 100) / 100;
        const mp = starter ? 8 + Math.round(r()) : Math.round(r() * 5);
        players.push({
          id, name, shortName: name.split(" ")[1], teamId: t.id, position: pos, status,
          statusNote: status === "lesionado" ? "Lesión muscular (demo)" : status === "sancionado" ? "Acumulación de amarillas (demo)" : null,
          startProb: status === "lesionado" || status === "sancionado" ? 0 : starter ? Math.round((0.6 + r() * 0.35) * 20) / 20 : Math.round(r() * 0.4 * 20) / 20,
          value, sourceHistory: null, sourceStreakDays: null, sourceAcceleration: null,
          nextOpponentId: null, nextHome: null, nextMatchday: null,
          pointsTotal: Math.round(avg * mp), pointsAvg: mp ? avg : null, points5: Math.round(avg * played5 * (0.8 + r() * 0.4)), played5,
          matchesPlayed: mp, lastPoints: Math.round(avg + (r() - 0.5) * 6), source: "demo", sourceId: null, updatedAt: stamp,
        });
      }
    }
  }
  // Guion: algunos jugadores con tendencias claras para que el motor tenga casos que explicar
  const scripted = (i: number, d: number) => drift.set(players[i].id, d);
  scripted(3, 0.035); scripted(20, 0.028); scripted(41, -0.04); scripted(77, 0.032); scripted(130, -0.03); scripted(205, 0.025);

  // Histórico de 30 días por paseo aleatorio hacia atrás desde el valor actual
  const snapStmt: { playerId: string; value: number; date: string }[] = [];
  for (const p of players) {
    let v = p.value!;
    const d = drift.get(p.id)!;
    for (let k = 0; k < 30; k++) {
      snapStmt.push({ playerId: p.id, value: Math.round(v / 1000) * 1000, date: addDays(day, -k) });
      const accel = k < 3 ? 1.3 : 1;
      v = v / (1 + d * accel + (r() - 0.5) * 0.012);
    }
  }
  repo.upsertPlayers(players);
  const byDate = new Map<string, { playerId: string; value: number }[]>();
  for (const s of snapStmt) (byDate.get(s.date) ?? byDate.set(s.date, []).get(s.date)!).push({ playerId: s.playerId, value: s.value });
  for (const [date, list] of byDate) repo.recordSnapshots(list, date, "demo");
  // El valor actual coincide con la instantánea de hoy
  db.prepare("UPDATE players SET value = (SELECT value FROM price_snapshots s WHERE s.player_id = players.id AND s.date = ?)").run(day);

  // ── Alineaciones probables de la jornada 10 (demo) ──
  const md = 10;
  for (const t of TEAMS) {
    const teamPlayers = repo.getPlayers().filter((p) => p.teamId === t.id && p.position !== "ENT");
    const entries = teamPlayers.map((p) => ({
      playerName: p.name,
      playerId: p.id,
      role: (p.status === "lesionado" ? "lesionado" : p.status === "sancionado" ? "sancionado" : (p.startProb ?? 0) >= 0.6 ? "titular" : (p.startProb ?? 0) >= 0.4 ? "duda" : "suplente") as "titular",
      probability: p.startProb,
      source: "demo" as const,
      updatedAt: stamp,
    }));
    repo.replaceImportedLineup(md, t.id, entries);
  }

  // ── Plantilla del usuario ──
  const all = repo.getPlayers();
  const pick = (pos: Position, count: number, skip: number) => all.filter((p) => p.position === pos).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(skip, skip + count * 6).filter((_, i) => i % 6 === 0).slice(0, count);
  const squadPlayers = [...pick("POR", 2, 4), ...pick("DEF", 5, 10), ...pick("MED", 5, 8), ...pick("DEL", 3, 6)];
  const injured = all.find((p) => p.status === "lesionado" && p.position === "MED");
  if (injured && !squadPlayers.includes(injured)) squadPlayers[9] = injured;
  const falling = all.find((p) => p.id === players[41].id);
  if (falling && !squadPlayers.includes(falling) && falling.position !== "ENT") squadPlayers[squadPlayers.findIndex((p) => p.position === falling.position)] = falling;
  const snaps = repo.getSnapshots();
  squadPlayers.forEach((p, i) => {
    const ago = 6 + (i % 10) * 2;
    const hist = snaps.get(p.id)?.find((s) => s.date === addDays(day, -ago));
    repo.addToSquadUnchecked(p.id, hist?.value ?? p.value ?? 1_000_000, addDays(day, -ago));
  });
  repo.saveSettings({ budget: 4_250_000, teamName: "Demo FC", formation: "4-3-3", useCoach: false, maxSquadSize: 24 });
  // Once guardado (incluye a propósito un lesionado para mostrar las alertas)
  const lineup: Record<string, string | null> = {};
  const used = new Set<string>();
  for (const s of formationSlots("4-3-3", false)) {
    const p = squadPlayers.find((x) => x.position === s.position && !used.has(x.id));
    lineup[s.slot] = p?.id ?? null;
    if (p) used.add(p.id);
  }
  repo.saveSettings({ lineup });

  // Operaciones pasadas
  const txs: [string, "compra" | "venta", number, number | null, string][] = [
    [addDays(day, -20), "compra", 7_400_000, null, all[60].name],
    [addDays(day, -12), "venta", 8_150_000, 7_400_000, all[60].name],
    [addDays(day, -9), "compra", 3_100_000, null, all[90].name],
    [addDays(day, -4), "venta", 2_850_000, 3_100_000, all[90].name],
  ];
  const ins = db.prepare("INSERT INTO transactions (user_id, type, player_id, player_name, amount, cost_basis, date, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const [date, type, amount, basis, name] of txs) ins.run(repo.userId, type, null, name, amount, basis, date, "Operación de demostración", stamp);

  // Evolución del valor de la plantilla (calculada con las instantáneas demo)
  for (let k = 14; k >= 1; k--) {
    const d = addDays(day, -k);
    const v = squadPlayers.reduce((s, p) => s + (snaps.get(p.id)?.find((x) => x.date === d)?.value ?? 0), 0);
    repo.recordSquadValue(d, v, 4_250_000);
  }

  // Mercado del día: 12 jugadores que no están en la plantilla
  const inSquad = new Set(squadPlayers.map((p) => p.id));
  const marketPool = all.filter((p) => !inSquad.has(p.id) && p.position !== "ENT");
  const chosen = new Set<string>([players[3].id, players[20].id, players[77].id, players[205].id].filter((id) => !inSquad.has(id)));
  while (chosen.size < 12) chosen.add(marketPool[Math.floor(r() * marketPool.length)].id);
  for (const id of chosen) {
    const p = all.find((x) => x.id === id)!;
    repo.addListing({ date: day, playerId: id, askingPrice: p.value, seller: r() < 0.7 ? "LaLiga" : "Mánager demo" });
  }
  return { players: players.length, fixtures: fixtures.length };
}
