import { describe, expect, it } from "vitest";
import { assertRequiredJflVersion7OrLaterSerial, isJflVersion7OrLater } from "./db";
import { prepareAlarmSystemCreatePayload } from "./registrationCrudPayloads";

describe("serial da JFL versão 7 ou superior", () => {
  it("reconhece JFL da versão 7 em diante, inclusive versões com prefixo V", () => {
    expect(isJflVersion7OrLater({ brand: "JFL", firmwareVersion: "8.0.0" })).toBe(true);
    expect(isJflVersion7OrLater({ brand: "JFL", firmwareVersion: "V7.1" })).toBe(true);
    expect(isJflVersion7OrLater({ brand: "JFL", firmwareVersion: "6.9" })).toBe(false);
    expect(isJflVersion7OrLater({ brand: "INTELBRAS", firmwareVersion: "8.0" })).toBe(false);
  });

  it("exige exatamente dez dígitos e preserva o serial técnico normalizado", () => {
    expect(() => assertRequiredJflVersion7OrLaterSerial({ brand: "JFL", firmwareVersion: "7.0", serialNumber: "" })).toThrow("10 dígitos");
    expect(() => assertRequiredJflVersion7OrLaterSerial({ brand: "JFL", firmwareVersion: "8.0.0", serialNumber: "2801936621" })).not.toThrow();
    expect(prepareAlarmSystemCreatePayload({ serialNumber: "2801-936621" })).toEqual({ serialNumber: "2801936621" });
  });
});
