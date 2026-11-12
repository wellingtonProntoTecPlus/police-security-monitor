import { describe, expect, it } from "vitest";
import { buildCompatecPhysicalArmWithZonesFrames, buildCompatecPhysicalArmWithZonesPayload, buildCompatecPhysicalZoneFrames, buildCompatecPhysicalZonePayload, buildCompatecSimulationFrames, buildCompatecSimulationPayload, intelbrasPhysicalCommandInputSchema, isConfirmedCompatecBenchSystem, isConfirmedVettiBenchSystem, isKnownRemoteCommandBenchSystem, isPhysicalIntelbrasSystem, remoteCommandSimulationInputSchema, validateCompatecPhysicalZoneTarget, validateIntelbrasPhysicalTarget, validateRemoteCommandTarget } from "./remoteCommandContract";

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

  it("gera somente os dois quadros oficiais de bypass AK2→AK1 para a zona selecionada", () => {
    const isolated = buildCompatecPhysicalZoneFrames({ commandType: "isolate_zone", zoneNumber: 1 });
    const restored = buildCompatecPhysicalZoneFrames({ commandType: "restore_zone", zoneNumber: 23 });
    expect(isolated).toHaveLength(2);
    expect(isolated[0]).toMatch(/^MB=AK2\[/);
    expect(isolated[1]).toMatch(/^MB=AK1\[/);
    expect(isolated[0].replace(/\r\n$/, "").slice(8, -1).split(",")).toHaveLength(23);
    expect(isolated).toEqual([
      `MB=AK2[${["0008", ...Array(22).fill("0000")].join(",")}]\r\n`,
      `MB=AK1[${["0008", ...Array(22).fill("0000")].join(",")}]\r\n`,
    ]);
    expect(restored).toEqual([
      `MB=AK2[${[...Array(22).fill("0000"), "0008"].join(",")}]\r\n`,
      `MB=AK1[${[...Array(22).fill("0000"), "0000"].join(",")}]\r\n`,
    ]);
    expect(buildCompatecPhysicalZonePayload({ commandType: "isolate_zone", zoneNumber: 4, requestedBy: "Sr. Cliente" })).toMatch(/"mode":"physical"/);
    expect(validateCompatecPhysicalZoneTarget({ commandType: "isolate_zone", zoneNumber: 23 })).toBeUndefined();
    expect(validateCompatecPhysicalZoneTarget({ commandType: "arm", zoneNumber: 1 })).toContain("somente isolamento");
    expect(validateCompatecPhysicalZoneTarget({ commandType: "restore_zone", zoneNumber: 24 })).toContain("entre 1 e 23");
    expect(() => buildCompatecPhysicalZoneFrames({ commandType: "isolate_zone", zoneNumber: 24 })).toThrow();
  });

  it("gera o bypass selecionado antes do Arme total e não o envia quando não há chave ativa", () => {
    const frames = buildCompatecPhysicalArmWithZonesFrames([3, 5]);
    expect(buildCompatecPhysicalArmWithZonesFrames([])).toEqual(["MB=AK4[4]\r\n"]);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatch(/^MB=AK2\[/);
    expect(frames[1]).toMatch(/^MB=AK1\[/);
    expect(frames[2]).toBe("MB=AK4[4]\r\n");
    const selectedMask = Array.from({ length: 23 }, (_, index) => [3, 5].includes(index + 1) ? "0008" : "0000").join(",");
    expect(frames).toEqual([`MB=AK2[${selectedMask}]\r\n`, `MB=AK1[${selectedMask}]\r\n`, "MB=AK4[4]\r\n"]);
    const payload = JSON.parse(buildCompatecPhysicalArmWithZonesPayload({
      zoneNumbers: [5, 3, 3], requestedBy: "Responsável", selectedBy: [{ zoneNumber: 3, operatorId: 17, operatorName: "Operadora" }],
    }));
    expect(payload).toMatchObject({ mode: "physical_arm_with_zones", commandType: "arm", zoneNumbers: [3, 5], requestedBy: "Responsável" });
    expect(payload.frames).toEqual(frames);
    expect(payload.selectedBy).toEqual([{ zoneNumber: 3, operatorId: 17, operatorName: "Operadora" }]);
    expect(() => buildCompatecPhysicalArmWithZonesFrames([0])).toThrow();
    expect(() => buildCompatecPhysicalArmWithZonesFrames([24])).toThrow();
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
