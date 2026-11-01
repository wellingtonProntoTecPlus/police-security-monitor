import { describe, expect, it } from "vitest";
import {
  buildIntelbrasPhysicalArmDisarmFrame,
  buildIntelbrasPhysicalLoginFrame,
  buildIntelbrasPhysicalPayload,
  buildIntelbrasPhysicalSessionFinishFrame,
  getIntelbrasPhysicalFrameFromPayload,
  isIntelbrasPhysicalStateConfirmed,
  parseIntelbrasIsecProgramResponse,
} from "./intelbrasIsecProgramTransport";

describe("transporte físico Intelbras AMT-8000 ISECProgram via E7", () => {
  it("reproduz o quadro real oficial 0x16 para todas as partições", () => {
    expect(buildIntelbrasPhysicalArmDisarmFrame(0)).toEqual(Buffer.from("06E7021600C291A6", "hex"));
  });

  it("reproduz o vetor oficial do comando 0x16 para a partição C", () => {
    expect(buildIntelbrasPhysicalArmDisarmFrame(0x04)).toEqual(Buffer.from("06E7021604428A39", "hex"));
  });

  it("codifica a senha remota de seis dígitos em BCD no login E7/0x11 oficial", () => {
    expect(buildIntelbrasPhysicalLoginFrame("878787")).toEqual(Buffer.from("09E705118787879968F182", "hex"));
    expect(() => buildIntelbrasPhysicalLoginFrame("1234")).toThrow("6 dígitos");
    expect(() => buildIntelbrasPhysicalLoginFrame("12A456")).toThrow("6 dígitos");
  });

  it("monta o comando oficial 0x15 que libera o teclado ao terminar a sessão remota", () => {
    expect(buildIntelbrasPhysicalSessionFinishFrame()).toEqual(Buffer.from("05E70115067E71", "hex"));
  });

  it("mantém o payload persistido sem senha e consegue reconstruir só o quadro de ação", () => {
    const payload = buildIntelbrasPhysicalPayload({ commandType: "arm", partition: 0 });
    expect(payload).not.toContain("password");
    expect(payload).not.toContain("878787");
    expect(getIntelbrasPhysicalFrameFromPayload(payload)).toEqual(Buffer.from("06E7021600C291A6", "hex"));
  });

  it("valida a resposta oficial E7/0x96 de ativação e extrai o estado do painel", () => {
    const response = parseIntelbrasIsecProgramResponse(Buffer.from("06E7029603769448", "hex"));
    expect(response?.command).toBe(0x96);
    expect(response?.data).toEqual(Buffer.from([0x03]));
    expect(isIntelbrasPhysicalStateConfirmed("arm", response!.data[0]!)).toBe(true);
  });

  it("reconhece quadro válido de Arme recusado por zonas abertas sem confundi-lo com confirmação", () => {
    const response = parseIntelbrasIsecProgramResponse(Buffer.from("06E7029680F59D41", "hex"));
    expect(response?.data).toEqual(Buffer.from([0x80]));
    expect(isIntelbrasPhysicalStateConfirmed("arm", response!.data[0]!)).toBe(false);
    expect(isIntelbrasPhysicalStateConfirmed("disarm", response!.data[0]!)).toBe(true);
  });

  it("valida as respostas de autenticação aceita/recusada e liberação da sessão", () => {
    expect(parseIntelbrasIsecProgramResponse(Buffer.from("05E7015087E328", "hex"))?.command).toBe(0x50);
    expect(parseIntelbrasIsecProgramResponse(Buffer.from("05E7015387E921", "hex"))?.command).toBe(0x53);
    expect(parseIntelbrasIsecProgramResponse(Buffer.from("05E70195857D71", "hex"))?.command).toBe(0x95);
  });

  it("recusa respostas com checksum externo (ACK genérico), CRC interno ou comprimento inválido", () => {
    expect(parseIntelbrasIsecProgramResponse(Buffer.from("05E70195857D70", "hex"))).toBeUndefined();
    expect(parseIntelbrasIsecProgramResponse(Buffer.from("06E7029603769449", "hex"))).toBeUndefined();
    expect(parseIntelbrasIsecProgramResponse(Buffer.from("06E7029603769548", "hex"))).toBeUndefined();
    expect(parseIntelbrasIsecProgramResponse(Buffer.from("06E702960376944800", "hex"))).toBeUndefined();
  });

  it("confirma Arme só quando há partição armada e nenhuma zona aberta, e Desarme sem partição armada", () => {
    expect(isIntelbrasPhysicalStateConfirmed("arm", 0x03)).toBe(true);
    expect(isIntelbrasPhysicalStateConfirmed("arm", 0x80)).toBe(false);
    expect(isIntelbrasPhysicalStateConfirmed("arm", 0x00)).toBe(false);
    expect(isIntelbrasPhysicalStateConfirmed("disarm", 0x00)).toBe(true);
    expect(isIntelbrasPhysicalStateConfirmed("disarm", 0x01)).toBe(false);
  });
});
