import { describe, expect, it } from "vitest";
import { buildVettiFrame, buildVettiSimulationFrames, buildVettiSimulationPayload, calculateVettiCrc, validateVettiSimulationTarget } from "./vettiCommandSimulation";

describe("simulação auditável de comandos Vetti VSec", () => {
  it("reproduz os CRCs dos quadros oficiais de status, PGM e isolamento", () => {
    expect(buildVettiFrame(0x14, [0xFF])).toBe("02 05 AF 14 FF B1");
    expect(buildVettiFrame(0x17, [0x01, 0x02, 0xFF])).toBe("02 07 AF 17 01 02 FF AB");
    expect(buildVettiFrame(0x29, [0x01, 0x00, 0x02])).toBe("02 07 AF 29 01 00 02 11");
    expect(calculateVettiCrc([0x07, 0xAF, 0x11, 0x12, 0x34, 0xFF])).toBe(0x47);
  });

  it("prepara Arme e Desarme com login, status e sem expor a senha técnica", () => {
    const arm = buildVettiSimulationFrames({ commandType: "arm" });
    const disarm = buildVettiSimulationFrames({ commandType: "disarm" });
    expect(arm).toEqual(["02 07 AF 11 <SENHA_DE_ACESSO_REMOTO_CIFRADA> FF <CRC>", "02 05 AF 14 FF B1", "02 <NB> AF 42 3F <SENHA_DE_COMANDO_CIFRADA> FF <CRC>"]);
    expect(disarm.at(-1)).toContain("AF 43 3F");
    expect(JSON.stringify(arm)).not.toContain("034567");
  });

  it("monta PGM e isolamento com o comando vigente 0x29", () => {
    expect(buildVettiSimulationFrames({ commandType: "activate_pgm", pgmNumber: 2 }).at(-1)).toBe("02 07 AF 17 01 02 FF AB");
    expect(buildVettiSimulationFrames({ commandType: "isolate_zone", zoneNumber: 2 }).at(-1)).toBe("02 07 AF 29 01 00 02 11");
    expect(buildVettiSimulationFrames({ commandType: "restore_zone", zoneNumber: 2 }).at(-1)).toBe("02 07 AF 29 00 00 02 7A");
  });

  it("limita alvo Vetti a 511 zonas e 255 PGMs", () => {
    expect(validateVettiSimulationTarget({ commandType: "isolate_zone", zoneNumber: 512 })).toContain("1 e 511");
    expect(validateVettiSimulationTarget({ commandType: "activate_pgm", pgmNumber: 256 })).toContain("1 e 255");
    expect(validateVettiSimulationTarget({ commandType: "restore_zone", zoneNumber: 511 })).toBeUndefined();
  });

  it("persiste uma descrição de simulação sem credenciais em texto aberto", () => {
    const payload = buildVettiSimulationPayload({ commandType: "activate_pgm", pgmNumber: 2 });
    expect(payload).toContain("Vetti VSec Rev. 13");
    expect(payload).toContain("nenhum frame VSec foi transmitido");
    expect(payload).not.toContain("senha=\"");
  });
});
