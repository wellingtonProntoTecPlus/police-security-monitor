import { describe, expect, it } from "vitest";
import { buildCompatecSimulationFrames, buildCompatecSimulationPayload, buildCompatecZoneConfigurationFrames, buildCompatecZoneConfigurationPayload, compatecZoneConfigurationInputSchema, intelbrasPhysicalCommandInputSchema, isConfirmedCompatecBenchSystem, isConfirmedVettiBenchSystem, isKnownRemoteCommandBenchSystem, isPhysicalIntelbrasSystem, remoteCommandSimulationInputSchema, validateIntelbrasPhysicalTarget, validateRemoteCommandTarget } from "./remoteCommandContract";

describe("contrato de comandos remotos Compatec", () => {
  it("libera a consulta física inicial somente para o MAC da bancada habilitada", () => {
    expect(isConfirmedCompatecBenchSystem({ brand: "COMPATEC", macAddress: "C1BDCB", remoteCommandLabEnabled: true })).toBe(true);
    expect(isConfirmedCompatecBenchSystem({ brand: "COMPATEC", macAddress: "C1BDCB", remoteCommandLabEnabled: false })).toBe(false);
    expect(isConfirmedCompatecBenchSystem({ brand: "COMPATEC", macAddress: "F0F0F0", remoteCommandLabEnabled: true })).toBe(false);
  });

  it("reserva uma futura ação física Vetti somente ao MAC da bancada habilitada", () => {
    expect(isConfirmedVettiBenchSystem({ brand: "VETTI", macAddress: "FC-0F-E7-2D-E4-A8", remoteCommandLabEnabled: true })).toBe(true);
    expect(isConfirmedVettiBenchSystem({ brand: "VETTI", macAddress: "FC0FE72DE4A8", remoteCommandLabEnabled: false })).toBe(false);
    expect(isConfirmedVettiBenchSystem({ brand: "VETTI", macAddress: "FC0FE7123456", remoteCommandLabEnabled: true })).toBe(false);
    expect(isConfirmedVettiBenchSystem({ brand: "COMPATEC", macAddress: "FC0FE72DE4A8", remoteCommandLabEnabled: true })).toBe(false);
  });

  it("reconhece as bancadas Compatec/Vetti e a AMT-8000 ativa, sempre por identidade física", () => {
    expect(isKnownRemoteCommandBenchSystem({ brand: "COMPATEC", macAddress: "F024F9C1BDCB" })).toBe(true);
    expect(isKnownRemoteCommandBenchSystem({ brand: "VETTI", macAddress: "2DE4A8" })).toBe(true);
    expect(isKnownRemoteCommandBenchSystem({ brand: "INTELBRAS", model: "AMT-8000", macAddress: "1C17E4", isActive: true })).toBe(true);
    expect(isKnownRemoteCommandBenchSystem({ brand: "INTELBRAS", model: "AMT-8000", macAddress: "", isActive: true })).toBe(false);
    expect(isKnownRemoteCommandBenchSystem({ brand: "INTELBRAS", model: "AMT-2018", macAddress: "1C17E4", isActive: true })).toBe(false);
    expect(isKnownRemoteCommandBenchSystem({ brand: "INTELBRAS", model: "AMT-8000", macAddress: "1C17E4", isActive: false })).toBe(false);
    expect(isKnownRemoteCommandBenchSystem({ brand: "VETTI", macAddress: "AABBCC" })).toBe(false);
    expect(isKnownRemoteCommandBenchSystem({ brand: "JFL", macAddress: "2DE4A8" })).toBe(false);
  });

  it("exige o alvo operacional para isolamento, restauração e PGM", () => {
    expect(validateRemoteCommandTarget({ commandType: "isolate_zone" })).toBe("Informe uma zona Compatec entre 1 e 10 para isolar ou restaurar");
    expect(validateRemoteCommandTarget({ commandType: "restore_zone" })).toBe("Informe uma zona Compatec entre 1 e 10 para isolar ou restaurar");
    expect(validateRemoteCommandTarget({ commandType: "isolate_zone", zoneNumber: 11 })).toBe("Informe uma zona Compatec entre 1 e 10 para isolar ou restaurar");
    expect(validateRemoteCommandTarget({ commandType: "activate_pgm" })).toBe("Informe a PGM a acionar");
    expect(validateRemoteCommandTarget({ commandType: "isolate_zone", zoneNumber: 3 })).toBeUndefined();
    expect(validateRemoteCommandTarget({ commandType: "activate_pgm", pgmNumber: 2 })).toBeUndefined();
  });

  it("registra uma simulação sem quadro transmissível ou credencial do operador", () => {
    const payload = JSON.parse(buildCompatecSimulationPayload({ commandType: "activate_pgm", pgmNumber: 2 }));
    expect(payload).toMatchObject({ protocol: "Compatec MicroBus", mode: "simulation", commandType: "activate_pgm", pgmNumber: 2 });
    expect(payload.frames).toEqual(["MB=AJ4[6]\r\n"]);
    expect(payload.note).toContain("nenhum pacote");
    expect(payload).not.toHaveProperty("password");
    expect(payload).not.toHaveProperty("frame");
  });

  it("aceita a confirmação pela sessão ativa sem exigir a senha do operador", () => {
    const input = remoteCommandSimulationInputSchema.parse({
      alarmSystemId: 27,
      commandType: "arm",
      reason: "Teste controlado na central de bancada",
    });

    expect(input).toMatchObject({ alarmSystemId: 27, commandType: "arm" });
    expect(input).not.toHaveProperty("password");
  });

  it("gera os quadros documentados para arme, desarme, isolamento e restauração de setor", () => {
    expect(buildCompatecSimulationFrames({ commandType: "arm" })).toEqual(["MB=AJ4[0,03FF]\r\n"]);
    expect(buildCompatecSimulationFrames({ commandType: "arm", partition: 1 })).toEqual(["MB=AJ4[0,0001]\r\n"]);
    expect(buildCompatecSimulationFrames({ commandType: "disarm" })).toEqual(["MB=AJ4[0,0000]\r\n"]);
    expect(buildCompatecSimulationFrames({ commandType: "isolate_zone", zoneNumber: 1 })).toEqual([
      "MB=AJ2[0008,0000,0000,0000,0000,0000,0000,0000,0000,0000]\r\n",
      "MB=AJ1[0008,0000,0000,0000,0000,0000,0000,0000,0000,0000]\r\n",
    ]);
    expect(buildCompatecSimulationFrames({ commandType: "restore_zone", zoneNumber: 1 })).toEqual([
      "MB=AJ2[0000,0000,0000,0000,0000,0000,0000,0000,0000,0000]\r\n",
      "MB=AJ1[0000,0000,0000,0000,0000,0000,0000,0000,0000,0000]\r\n",
    ]);
    expect(buildCompatecSimulationFrames({ commandType: "isolate_zone", zoneNumber: 2 })).toEqual([
      "MB=AJ2[0000,0008,0000,0000,0000,0000,0000,0000,0000,0000]\r\n",
      "MB=AJ1[0000,0008,0000,0000,0000,0000,0000,0000,0000,0000]\r\n",
    ]);
  });

  it("monta as máscaras oficiais de armamento, desarmamento e anulação multi-setorial, sem AK4", () => {
    const armAndAnnul = buildCompatecZoneConfigurationFrames([
      { zoneNumber: 1, armState: "armed" },
      { zoneNumber: 2, armState: "armed" },
      { zoneNumber: 3, bypassState: "annulled" },
      { zoneNumber: 4, bypassState: "annulled" },
    ]);
    const expectedMask = ["0080", "0080", "0008", "0008", ...Array(19).fill("0000")].join(",");
    expect(armAndAnnul).toEqual([`MB=AK2[${expectedMask}]\r\n`, `MB=AK1[${expectedMask}]\r\n`]);
    expect(armAndAnnul).toHaveLength(2);
    expect(armAndAnnul.join("\n")).not.toContain("AK4");
    expect(armAndAnnul.join("\n")).not.toContain("KA4");

    const disarmSectors = buildCompatecZoneConfigurationFrames([
      { zoneNumber: 1, armState: "disarmed" },
      { zoneNumber: 2, armState: "disarmed" },
    ]);
    const disarmMask = ["0080", "0080", ...Array(21).fill("0000")].join(",");
    const zeroValues = Array(23).fill("0000").join(",");
    expect(disarmSectors).toEqual([`MB=AK2[${disarmMask}]\r\n`, `MB=AK1[${zeroValues}]\r\n`]);

    const combinedBits = buildCompatecZoneConfigurationFrames([{ zoneNumber: 7, armState: "armed", bypassState: "annulled" }]);
    const combinedArgs = [...Array(6).fill("0000"), "0088", ...Array(16).fill("0000")].join(",");
    expect(combinedBits).toEqual([`MB=AK2[${combinedArgs}]\r\n`, `MB=AK1[${combinedArgs}]\r\n`]);
    expect(() => buildCompatecZoneConfigurationFrames([{ zoneNumber: 1 }])).toThrow();
    expect(() => buildCompatecZoneConfigurationFrames([{ zoneNumber: 24, armState: "armed" }])).toThrow();
    expect(() => buildCompatecZoneConfigurationFrames([{ zoneNumber: 1, armState: "armed" }, { zoneNumber: 1, bypassState: "annulled" }])).toThrow();

    const payload = JSON.parse(buildCompatecZoneConfigurationPayload({
      zoneChanges: [{ zoneNumber: 2, armState: "armed" }, { zoneNumber: 4, bypassState: "annulled" }],
    }));
    expect(payload).toMatchObject({ mode: "physical_zone_configuration", commandType: "configure_zones" });
    expect(payload).not.toHaveProperty("requestedBy");
    expect(payload.frames).toHaveLength(2);
    expect(payload.note).toContain("nenhum AK4");
    const validInput = {
      alarmSystemId: 1,
      incidentId: 9,
      leaseToken: "22222222-2222-4222-8222-222222222222",
      reason: "Ajuste solicitado",
      zoneChanges: [{ zoneNumber: 1, armState: "armed" }],
    };
    expect(compatecZoneConfigurationInputSchema.safeParse(validInput).success).toBe(true);
    expect(compatecZoneConfigurationInputSchema.safeParse({
      ...validInput,
      zoneChanges: [{ zoneNumber: 1, armState: "armed" }, { zoneNumber: 1, bypassState: "annulled" }],
    }).success).toBe(false);
  });

  it("aceita somente central Intelbras ativa com MAC e somente Arme/Desarme físico", () => {
    expect(isPhysicalIntelbrasSystem({ brand: "intelbras", model: "AMT-8000", macAddress: "7B:25:5F", isActive: true })).toBe(true);
    expect(isPhysicalIntelbrasSystem({ brand: "INTELBRAS", model: "AMT-8000", macAddress: "", isActive: true })).toBe(false);
    expect(isPhysicalIntelbrasSystem({ brand: "INTELBRAS", model: "AMT-2018", macAddress: "7B255F", isActive: true })).toBe(false);
    expect(isPhysicalIntelbrasSystem({ brand: "JFL", model: "AMT-8000", macAddress: "7B255F", isActive: true })).toBe(false);
    expect(validateIntelbrasPhysicalTarget({ commandType: "arm", partition: 0 })).toBeUndefined();
    expect(validateIntelbrasPhysicalTarget({ commandType: "disarm", partition: 0 })).toBeUndefined();
    expect(validateIntelbrasPhysicalTarget({ commandType: "arm", partition: 4 })).toContain("todas as partições");
    expect(intelbrasPhysicalCommandInputSchema.parse({ alarmSystemId: 49, commandType: "arm", reason: "Teste físico controlado", partition: 0 })).toMatchObject({ alarmSystemId: 49, commandType: "arm" });
    expect(() => intelbrasPhysicalCommandInputSchema.parse({ alarmSystemId: 49, commandType: "arm", reason: "Teste físico controlado", partition: 1 })).toThrow();
  });
});
