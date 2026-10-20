/**
 * Asesor de pujas. En LaLiga Fantasy los fichajes del mercado se resuelven por puja ciega:
 * solo sabes si alguien más ha pujado, no cuánto. Este módulo calcula, para un jugador:
 *  - la PUJA MÁXIMA: por encima de ella el fichaje deja de compensar;
 *  - la PUJA RECOMENDADA: si no hay rivales, cerca del mínimo; si los hay, más cerca del máximo.
 * Dos objetivos distintos:
 *  - "puntos": quieres que puntúe en tus próximas jornadas (aceptas pagar algo de más);
 *  - "dinero": compra para revender en pocos días (solo compensa si se espera que suba).
 * Función pura: se usa igual en el servidor y en el navegador.
 */

export type BidGoal = "puntos" | "dinero";

export interface BidInput {
  value: number; // valor de mercado actual
  floor: number; // puja mínima posible (precio de salida en tu mercado)
  dailyRate: number | null; // % diario de variación (tendencia)
  difficulties: (number | null)[]; // dificultad de los rivales de las 2 próximas jornadas (1..5)
  pointsGain2: number; // puntos esperados extra en 2 jornadas frente a tu titular más flojo de su línea
  pPlay: number;
  status: string;
  confidence: "baja" | "media" | "alta";
}

export interface BidContext {
  eurPerPoint: number; // lo que cuesta en el mercado un punto de rendimiento
  budget: number;
  /** Ventas posibles para financiar la puja, de la más prescindible a la menos */
  saleOptions: { playerId: string; name: string; value: number }[];
}

export interface BidAdvice {
  goal: BidGoal;
  verdict: "pujar" | "no-compensa" | "sin-presupuesto";
  floor: number;
  max: number | null;
  recommendedAlone: number | null;
  recommendedRivals: number | null;
  expectedGain: number; // revalorización esperada en el horizonte (puede ser negativa)
  pointsPremium: number; // valor en euros de los puntos extra (solo objetivo "puntos")
  horizonDays: number;
  affordable: number; // máximo que puedes pagar (saldo + venta más prescindible si hace falta)
  saleNeeded: { playerId: string; name: string; value: number } | null;
  cappedByBudget: boolean;
  notes: string[];
}

const round1000 = (n: number) => Math.floor(n / 1000) * 1000;

/** Importe "no redondo" para ganar a quien puja cifras redondas (p. ej. 12.437.137 €). */
export function oddAmount(n: number, cap: number): number {
  const v = round1000(n) + 137;
  return v <= cap ? v : round1000(cap);
}

export function computeBid(input: BidInput, ctx: BidContext, goal: BidGoal): BidAdvice {
  const { value, floor } = input;
  const notes: string[] = [];
  const hard = input.difficulties.filter((d) => d != null && d >= 4).length;
  const easy = input.difficulties.filter((d) => d != null && d <= 2).length;

  // Tendencia ajustada por calendario: un partido difícil suele traer bajada de precio.
  let rate = input.dailyRate ?? 0;
  if (hard) rate -= 0.4 * hard;
  if (easy === 2) rate += 0.2;
  rate = Math.max(-5, Math.min(5, rate));
  if (hard) notes.push(`Tiene ${hard === 2 ? "dos rivales difíciles" : "un rival difícil"} en las 2 próximas jornadas: es probable que su precio no suba (o baje).`);

  const unavailable = input.status === "lesionado" || input.status === "sancionado";
  const confidenceFactor = input.confidence === "alta" ? 1 : input.confidence === "media" ? 0.85 : 0.65;

  let max: number;
  let expectedGain: number;
  let pointsPremium = 0;
  let horizonDays: number;

  if (goal === "dinero") {
    // Comprar y revender en ~3 días: solo compensa pagar hasta el precio esperado de venta menos un margen.
    horizonDays = 3;
    expectedGain = value * (rate / 100) * horizonDays * 0.7;
    const margin = value * 0.015;
    max = value + expectedGain - margin;
    if (expectedGain <= margin) notes.push("No se espera que suba lo suficiente para revenderlo con beneficio.");
    else notes.push(`Si sigue la tendencia, en ${horizonDays} días valdría unos ${fmt(value + expectedGain)}.`);
  } else {
    // Puntuar: los puntos extra tienen un valor en euros; la variación de precio en ~2 semanas cuenta poco.
    horizonDays = 14;
    expectedGain = value * (rate / 100) * horizonDays * 0.25;
    const gain = Math.max(0, input.pointsGain2);
    // 2 jornadas con calendario conocido + 2 más al mismo nivel; descontado por probabilidad de jugar y confianza.
    pointsPremium = gain * 2 * ctx.eurPerPoint * Math.min(1, input.pPlay + 0.2) * confidenceFactor;
    if (input.status === "duda") pointsPremium *= 0.7;
    max = value + pointsPremium + (expectedGain > 0 ? expectedGain * 0.7 : expectedGain);
    if (gain < 0.5) notes.push("Apenas mejora tu once: no merece la pena pagar por encima de su valor.");
    else notes.push(`Aporta unos +${input.pointsGain2.toFixed(1)} puntos en 2 jornadas frente a tu titular más flojo.`);
  }
  if (unavailable) {
    max = Math.min(max, value);
    notes.push("Está lesionado o sancionado: no pujes por encima de su valor.");
  }

  // Lo que puedes pagar: saldo, o saldo + la venta más prescindible que lo cubra.
  let affordable = Math.max(0, ctx.budget);
  let saleNeeded: BidAdvice["saleNeeded"] = null;
  if (max > affordable) {
    // Preferimos la venta más prescindible que cubra el máximo; si ninguna, la que cubra al menos el mínimo.
    const covers = (target: number) => ctx.saleOptions.find((s) => ctx.budget + s.value >= target);
    const sale = covers(max) ?? covers(floor);
    if (sale && ctx.budget + sale.value > affordable) {
      saleNeeded = sale;
      affordable = ctx.budget + sale.value;
    }
  }
  if (floor > affordable) {
    return { goal, verdict: "sin-presupuesto", floor, max: null, recommendedAlone: null, recommendedRivals: null, expectedGain, pointsPremium, horizonDays, affordable, saleNeeded, cappedByBudget: true, notes: [...notes, "No te llega ni para el precio mínimo, aunque vendas a tu jugador más prescindible."] };
  }
  const cappedByBudget = max > affordable;
  max = Math.min(max, affordable);
  max = round1000(max);

  if (max < floor) {
    return { goal, verdict: "no-compensa", floor, max: null, recommendedAlone: null, recommendedRivals: null, expectedGain, pointsPremium, horizonDays, affordable, saleNeeded: null, cappedByBudget, notes };
  }
  const room = max - floor;
  const recommendedAlone = Math.max(floor, oddAmount(floor + room * 0.25, max));
  const recommendedRivals = Math.max(recommendedAlone, oddAmount(floor + room * 0.75, max));
  if (cappedByBudget) notes.push("El máximo está limitado por tu presupuesto.");
  return { goal, verdict: "pujar", floor, max, recommendedAlone, recommendedRivals, expectedGain, pointsPremium, horizonDays, affordable, saleNeeded: max > ctx.budget ? saleNeeded : null, cappedByBudget, notes };
}

/** Cuánto cuesta en el mercado un punto de rendimiento (euros por punto en lo que queda de temporada). */
export function euroPerPoint(players: { value: number | null; pointsAvg: number | null; pPlay: number }[], remainingMatchdays: number): number {
  const ratios = players
    .filter((p) => p.value != null && p.value > 0 && (p.pointsAvg ?? 0) >= 2 && p.pPlay >= 0.6)
    .map((p) => p.value! / (p.pointsAvg! * Math.max(1, remainingMatchdays)))
    .sort((a, b) => a - b);
  if (!ratios.length) return 100_000;
  return ratios[Math.floor(ratios.length / 2)];
}

function fmt(n: number) {
  return `${Math.round(n).toLocaleString("es-ES")} €`;
}
