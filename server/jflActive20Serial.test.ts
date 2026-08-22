import { describe, expect, it } from "vitest";
import { assertRequiredJflVersion5OrLaterSerial, isJflVersion5OrLater } from "./db";
import { prepareAlarmSystemCreatePayload } from "./registrationCrudPayloads";
import { getAlarmSystemIdentifierValidationError } from "@shared/alarmSystemProfiles";

describe("serial da JFL versão 5 ou superior", () => {
  it("reconhece JFL da versão 5 em diante, inclusive versões com prefixo V", () => {
    expect(isJflVersion5OrLater({ brand: "JFL", firmwareVersion: "8.0.0" })).toBe(true);
    expect(isJflVersion5OrLater({ brand: "JFL", firmwareVersion: "V5.1" })).toBe(true);
    expect(isJflVersion5OrLater({ brand: "JFL", firmwareVersion: "4.9" })).toBe(false);
    expect(isJflVersion5OrLater({ brand: "INTELBRAS", firmwareVersion: "8.0" })).toBe(false);
  });

  it("exige exatamente dez dígitos e preserva o serial técnico normalizado", () => {
    expect(() => assertRequiredJflVersion5OrLaterSerial({ brand: "JFL", firmwareVersion: "5.0", serialNumber: "" })).toThrow("10 dígitos");
    expect(() => assertRequiredJflVersion5OrLaterSerial({ brand: "JFL", firmwareVersion: "4.9", serialNumber: "" })).not.toThrow();
    expect(() => assertRequiredJflVersion5OrLaterSerial({ brand: "JFL", firmwareVersion: "8.0.0", serialNumber: "2801936621" })).not.toThrow();
    expect(prepareAlarmSystemCreatePayload({ serialNumber: "2801-936621" })).toEqual({ serialNumber: "2801936621" });
  });

  it("mantém o serial opcional abaixo da versão 5 quando MAC ou IMEI identifica a central", () => {
    expect(getAlarmSystemIdentifierValidationError({ brand: "JFL", firmwareVersion: "4.9", macAddress: "7370F2", serialNumber: "" })).toBeNull();
    expect(getAlarmSystemIdentifierValidationError({ brand: "JFL", firmwareVersion: "5.0", macAddress: "7370F2", serialNumber: "" })).toContain("versão 5 ou superior");
    expect(getAlarmSystemIdentifierValidationError({ brand: "JFL", firmwareVersion: "5.0", serialNumber: "2684676297" })).toBeNull();
  });
});
