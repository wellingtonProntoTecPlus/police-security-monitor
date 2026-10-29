import { describe, expect, it } from "vitest";
import {
  buildIntelbrasIsecnetArmDisarmFrame,
  buildIntelbrasSimulationPayload,
  calculateIntelbrasIsecnetChecksum,
  calculateIntelbrasIsecProgramCrc,
  validateIntelbrasSimulationTarget,
} from "./intelbrasCommandSimulation";

describe("simulação de comandos Intelbras AMT-8000", () => {
  it("calcula o CRC interno documentado para todas as partições", () => {
    expect(calculateIntelbrasIsecProgramCrc([0x02, 0x16, 0x00])).toBe(0x7428);
  });

  it("calcula o checksum externo E7 conforme o exemplo do SDK", () => {
    expect(calculateIntelbrasIsecnetChecksum([0x05, 0xe7, 0x01, 0x10, 0x06, 0x60])).toBe(0x6a);
  });

  it("monta o quadro E7/0x16 sem transmitir", () => {
    expect(buildIntelbrasIsecnetArmDisarmFrame()).toEqual(Buffer.from("06E7021600742856", "hex"));
    expect(buildIntelbrasIsecnetArmDisarmFrame(0x01)).toEqual(Buffer.from("06E7021601F42DD2", "hex"));
  });

  it("registra Arme e Desarme como simulações com o quadro calculado", () => {
    const payload = JSON.parse(buildIntelbrasSimulationPayload({ commandType: "disarm" }));
    expect(payload).toMatchObject({
      protocol: "Intelbras ISECnet / ISECProgram",
      mode: "simulation",
      commandType: "disarm",
      operation: 0,
      frames: ["06 E7 02 16 00 74 28 56"],
    });
    expect(payload.note).toContain("nenhum quadro foi transmitido");
  });

  it("não libera isolamento ou PGM na etapa inicial Intelbras", () => {
    expect(validateIntelbrasSimulationTarget({ commandType: "arm" })).toBeUndefined();
    expect(validateIntelbrasSimulationTarget({ commandType: "disarm" })).toBeUndefined();
    expect(validateIntelbrasSimulationTarget({ commandType: "isolate_zone" })).toContain("aceita apenas a simulação de Arme/Desarme");
    expect(validateIntelbrasSimulationTarget({ commandType: "activate_pgm" })).toContain("aceita apenas a simulação de Arme/Desarme");
  });
});
