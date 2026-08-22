import { describe, expect, it } from "vitest";
import { ALARM_SYSTEM_PROFILES, applyAlarmSystemBrandProfile, getAlarmSystemIdentifierValidationError } from "./alarmSystemProfiles";

describe("perfis técnicos de centrais", () => {
  it("define porta e supervisão padrão para cada fabricante", () => {
    expect(ALARM_SYSTEM_PROFILES.COMPATEC.primaryReceiverPort).toBe(9112);
    expect(ALARM_SYSTEM_PROFILES.VETTI.primaryReceiverPort).toBe(9161);
    expect(ALARM_SYSTEM_PROFILES.RADIOENGE.primaryReceiverPort).toBe(9035);
    expect(ALARM_SYSTEM_PROFILES.VIAWEB.primaryReceiverPort).toBe(9111);
    expect(ALARM_SYSTEM_PROFILES.JFL.expectedKeepAliveSeconds).toBe(60);
  });

  it("limpa identificadores do painel anterior ao trocar de fabricante", () => {
    const profile = applyAlarmSystemBrandProfile({ brand: "JFL", macAddress: "C1BDCB", serialNumber: "2801936621", account: "0044" }, "COMPATEC");
    expect(profile).toMatchObject({ brand: "COMPATEC", receiverPort: 9112, macAddress: "", serialNumber: "", account: "0044" });
  });

  it("exige identificador compatível com o perfil selecionado", () => {
    expect(getAlarmSystemIdentifierValidationError({ brand: "COMPATEC" })).toContain("MAC");
    expect(getAlarmSystemIdentifierValidationError({ brand: "JFL", firmwareVersion: "8.0", serialNumber: "2801936621" })).toBeNull();
    expect(getAlarmSystemIdentifierValidationError({ brand: "VIAWEB" })).toBeNull();
  });
});
