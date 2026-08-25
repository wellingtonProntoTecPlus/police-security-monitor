import { describe, expect, it } from "vitest";
import { buildCompatecSimulationFrames, buildCompatecSimulationPayload, isConfirmedCompatecBenchSystem, remoteCommandSimulationInputSchema, validateRemoteCommandTarget } from "./remoteCommandContract";

describe("contrato de comandos remotos Compatec", () => {
  it("libera a consulta física inicial somente para o MAC da bancada habilitada", () => {
    expect(isConfirmedCompatecBenchSystem({ brand: "COMPATEC", macAddress: "C1BDCB", remoteCommandLabEnabled: true })).toBe(true);
    expect(isConfirmedCompatecBenchSystem({ brand: "COMPATEC", macAddress: "C1BDCB", remoteCommandLabEnabled: false })).toBe(false);
    expect(isConfirmedCompatecBenchSystem({ brand: "COMPATEC", macAddress: "F0F0F0", remoteCommandLabEnabled: true })).toBe(false);
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
});
