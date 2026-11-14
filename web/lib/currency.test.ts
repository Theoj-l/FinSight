import { describe, expect, it } from "vitest";
import { abbreviate, formatCurrencyExact } from "./currency";

describe("abbreviate", () => {
  it("shortens amounts to K, M and B and drops trailing zeros", () => {
    expect(abbreviate(5_117_060)).toBe("5.12M");
    expect(abbreviate(343_840)).toBe("343.8K");
    expect(abbreviate(2_000_000)).toBe("2M");
    expect(abbreviate(1_500)).toBe("1.5K");
    expect(abbreviate(1_250_000_000)).toBe("1.25B");
    expect(abbreviate(950)).toBe("950");
  });
});

describe("formatCurrencyExact with the compact setting", () => {
  const sgd = { currency: "SGD" as const, rates: null };

  it("shows full figures by default", () => {
    expect(formatCurrencyExact(5_117_060.5, sgd)).toBe("$5,117,060.50");
  });

  it("abbreviates when compact is on, keeping the sign", () => {
    expect(formatCurrencyExact(5_117_060.5, { ...sgd, compact: true })).toBe("$5.12M");
    expect(formatCurrencyExact(-343_840, { ...sgd, compact: true })).toBe("-$343.8K");
  });
});
