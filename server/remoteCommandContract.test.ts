import { describe, expect, it } from "vitest";
import { buildCompatecSimulationPayload, validateRemoteCommandTarget } from "./remoteCommandContract";

describe("contrato de comandos remotos Compatec", () => {
  it("exige o alvo operacional para isolamento, restauração e PGM", () => {
    expect(validateRemoteCommandTarget({ commandType: "isolate_zone" })).toBe("Informe a zona a isolar ou restaurar");
    expect(validateRemoteCommandTarget({ commandType: "restore_zone" })).toBe("Informe a zona a isolar ou restaurar");
    expect(validateRemoteCommandTarget({ commandType: "activate_pgm" })).toBe("Informe a PGM a acionar");
    expect(validateRemoteCommandTarget({ commandType: "isolate_zone", zoneNumber: 3 })).toBeUndefined();
    expect(validateRemoteCommandTarget({ commandType: "activate_pgm", pgmNumber: 2 })).toBeUndefined();
  });

  it("registra uma simulação sem quadro transmissível ou credencial do operador", () => {
    const payload = JSON.parse(buildCompatecSimulationPayload({ commandType: "activate_pgm", pgmNumber: 2 }));
    expect(payload).toMatchObject({ protocol: "Compatec MicroBus", mode: "simulation", commandType: "activate_pgm", pgmNumber: 2 });
    expect(payload.note).toContain("nenhum pacote");
    expect(payload).not.toHaveProperty("password");
    expect(payload).not.toHaveProperty("frame");
  });
});
