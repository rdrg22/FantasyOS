import { describe, expect, it } from "vitest";
import { computeBid, euroPerPoint, oddAmount, type BidInput } from "@/lib/analytics/bidding";

const base: BidInput = {
  value: 10_000_000,
  floor: 10_000_000,
  dailyRate: 0,
  difficulties: [3, 3],
  pointsGain2: 0,
  pPlay: 0.9,
  status: "disponible",
  confidence: "alta",
};
const ctx = { eurPerPoint: 100_000, budget: 50_000_000, saleOptions: [] };

describe("asesor de pujas", () => {
  it("para ganar dinero solo sobrepuja si se espera que suba", () => {
    const flat = computeBid(base, ctx, "dinero");
    expect(flat.verdict).toBe("no-compensa");
    const rising = computeBid({ ...base, dailyRate: 3 }, ctx, "dinero");
    expect(rising.verdict).toBe("pujar");
    expect(rising.max!).toBeGreaterThan(base.floor);
    // nunca por encima del precio esperado de venta
    expect(rising.max!).toBeLessThanOrEqual(base.value + rising.expectedGain);
    expect(rising.recommendedAlone!).toBeGreaterThanOrEqual(base.floor);
    expect(rising.recommendedAlone!).toBeLessThanOrEqual(rising.recommendedRivals!);
    expect(rising.recommendedRivals!).toBeLessThanOrEqual(rising.max!);
  });

  it("los rivales difíciles reducen la puja máxima", () => {
    const easy = computeBid({ ...base, dailyRate: 3, difficulties: [1, 2] }, ctx, "dinero");
    const hard = computeBid({ ...base, dailyRate: 3, difficulties: [5, 4] }, ctx, "dinero");
    expect(hard.max ?? 0).toBeLessThan(easy.max!);
  });

  it("para puntuar paga más cuanto más mejora tu once", () => {
    const small = computeBid({ ...base, pointsGain2: 1 }, ctx, "puntos");
    const big = computeBid({ ...base, pointsGain2: 6 }, ctx, "puntos");
    expect(big.max!).toBeGreaterThan(small.max!);
    expect(big.pointsPremium).toBeGreaterThan(0);
    // si no mejora el once, no se paga por encima del mínimo
    const none = computeBid({ ...base, pointsGain2: 0 }, ctx, "puntos");
    expect(none.max).toBe(base.floor);
    expect(none.recommendedAlone).toBe(base.floor);
  });

  it("lesionados: nunca por encima de su valor", () => {
    const r = computeBid({ ...base, pointsGain2: 8, status: "lesionado" }, ctx, "puntos");
    expect(r.max!).toBeLessThanOrEqual(base.value);
  });

  it("respeta el presupuesto y propone la venta necesaria", () => {
    const tight = { eurPerPoint: 100_000, budget: 2_000_000, saleOptions: [{ playerId: "x", name: "Suplente", value: 9_000_000 }] };
    const r = computeBid({ ...base, pointsGain2: 6 }, tight, "puntos");
    expect(r.verdict).toBe("pujar");
    expect(r.saleNeeded?.name).toBe("Suplente");
    expect(r.max!).toBeLessThanOrEqual(11_000_000);
    const broke = computeBid({ ...base, pointsGain2: 6 }, { ...tight, saleOptions: [] }, "puntos");
    expect(broke.verdict).toBe("sin-presupuesto");
  });

  it("importes no redondos y sin pasarse del tope", () => {
    expect(oddAmount(12_345_678, 20_000_000)).toBe(12_345_137);
    expect(oddAmount(12_345_678, 12_345_100)).toBe(12_345_000);
  });

  it("valor de un punto en el mercado", () => {
    const v = euroPerPoint(
      [
        { value: 20_000_000, pointsAvg: 5, pPlay: 0.9 },
        { value: 10_000_000, pointsAvg: 5, pPlay: 0.9 },
        { value: 5_000_000, pointsAvg: 1, pPlay: 0.9 }, // descartado: media < 2
      ],
      20,
    );
    expect(v).toBe(200_000); // mediana de 100k y 200k (índice 1 de 2)
  });
});
