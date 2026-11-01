import { describe, expect, it } from "vitest";
import {
  buildIntelbrasIsecnetArmDisarmFrame,
  buildIntelbrasIsecnetProgramFrame,
  buildIntelbrasRemoteKeepAliveFrame,
  buildIntelbrasRemoteLoginFrame,
  buildIntelbrasRemoteSessionFinishFrame,
  buildIntelbrasSimulationPayload,
  calculateIntelbrasIsecnetChecksum,
  calculateIntelbrasIsecProgramCrc,
  validateIntelbrasSimulationTarget,
} from "./intelbrasCommandSimulation";

describe("simulação de comandos Intelbras AMT-8000", () => {
  it("reproduz o CRC interno do vetor real oficial E7/0x16 para todas as partições", () => {
    expect(calculateIntelbrasIsecProgramCrc([0x02, 0x16, 0x00])).toBe(0xc291);
    expect(calculateIntelbrasIsecProgramCrc([0x02, 0x16, 0x04])).toBe(0x428a);
  });

  it("calcula o checksum externo E7 conforme o exemplo do SDK", () => {
    expect(calculateIntelbrasIsecnetChecksum([0x05, 0xe7, 0x01, 0x10, 0x06, 0x60])).toBe(0x6a);
  });

  it("monta o quadro E7/0x16 sem transmitir", () => {
    expect(buildIntelbrasIsecnetArmDisarmFrame()).toEqual(Buffer.from("06E7021600C291A6", "hex"));
    expect(buildIntelbrasIsecnetArmDisarmFrame(0x04)).toEqual(Buffer.from("06E7021604428A39", "hex"));
  });

  it("reproduz os vetores oficiais de login, refresh, resposta 0x96 e liberação", () => {
    expect(buildIntelbrasRemoteLoginFrame("878787")).toEqual(Buffer.from("09E705118787879968F182", "hex"));
    expect(buildIntelbrasRemoteKeepAliveFrame()).toEqual(Buffer.from("05E7011006606A", "hex"));
    expect(buildIntelbrasIsecnetProgramFrame(0x96, [0x03])).toEqual(Buffer.from("06E7029603769448", "hex"));
    expect(buildIntelbrasRemoteSessionFinishFrame()).toEqual(Buffer.from("05E70115067E71", "hex"));
  });

  it("registra Arme e Desarme como simulações com o quadro calculado", () => {
    const payload = JSON.parse(buildIntelbrasSimulationPayload({ commandType: "disarm" }));
    expect(payload).toMatchObject({
      protocol: "Intelbras ISECnet / ISECProgram",
      mode: "simulation",
      commandType: "disarm",
      operation: 0,
      frames: ["06 E7 02 16 00 C2 91 A6"],
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
