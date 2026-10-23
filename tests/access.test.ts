import { afterEach, describe, expect, it } from "vitest";
import { isAllowedUser } from "@/lib/supabase/access";

const OWNER = "c3c88692-1aaa-44b1-bb34-a7500e8c31a4";

describe("acceso privado", () => {
  afterEach(() => {
    delete process.env.FOS_ALLOWED_USER_IDS;
  });
  it("por defecto solo entra el propietario", () => {
    expect(isAllowedUser(OWNER)).toBe(true);
    expect(isAllowedUser("otra-cuenta")).toBe(false);
    expect(isAllowedUser(null)).toBe(false);
  });
  it("la lista se puede ampliar o abrir por variable de entorno", () => {
    process.env.FOS_ALLOWED_USER_IDS = "a, b";
    expect(isAllowedUser("b")).toBe(true);
    expect(isAllowedUser(OWNER)).toBe(false);
    process.env.FOS_ALLOWED_USER_IDS = "*";
    expect(isAllowedUser("cualquiera")).toBe(true);
  });
});
