import { describe, expect, it } from "vitest";
import {
  buildIntelbrasPhysicalArmDisarmFrame,
  buildIntelbrasPhysicalPayload,
  getIntelbrasPhysicalFrameFromPayload,
  isIntelbrasPhysicalStateConfirmed,
  parseIntelbrasIsecProgramResponse,
} from "./intelbrasIsecProgramTransport";

describe("transporte físico Intelbras AMT-8000 E7/0x16", () => {
  it("monta o quadro oficial de ativação completa do SDK", () => {
    expect(buildIntelbrasPhysicalArmDisarmFrame(0)).toEqual(Buffer.from("06E7021600742856", "hex"));
  });

  it("monta a operação da partição A conforme o exemplo de CRC", () => {
    expect(buildIntelbrasPhysicalArmDisarmFrame(1)).toEqual(Buffer.from("06E7021601F42DD2", "hex"));
  });

  it("mantém o quadro físico sem senha e consegue reconstruí-lo somente do payload mascarado", () => {
    const payload = buildIntelbrasPhysicalPayload({ commandType: "arm", partition: 0 });
    expect(payload).not.toContain("password");
    expect(payload).not.toContain("1234");
    expect(getIntelbrasPhysicalFrameFromPayload(payload)).toEqual(Buffer.from("06E7021600742856", "hex"));
  });

  it("aceita a resposta oficial E7/0x96 de ativação completa", () => {
    const response = parseIntelbrasIsecProgramResponse(Buffer.from("06E7029603769448", "hex"));
    expect(response).toMatchObject({ status: 0x03, accepted: true });
  });

  it("recusa a resposta com checksum externo ou CRC interno inválido", () => {
    const invalidChecksum = Buffer.from("06E7029603769449", "hex");
    const invalidCrc = Buffer.from("06E7029603769548", "hex");
    expect(parseIntelbrasIsecProgramResponse(invalidChecksum)).toBeUndefined();
    expect(parseIntelbrasIsecProgramResponse(invalidCrc)).toBeUndefined();
  });

  it("não marca falha por zonas abertas como Arme confirmado", () => {
    const response = parseIntelbrasIsecProgramResponse(Buffer.from("06E7029680F59D41", "hex"));
    expect(response).toMatchObject({ status: 0x80, accepted: false });
    expect(isIntelbrasPhysicalStateConfirmed("arm", response!.status)).toBe(false);
  });

  it("confirma Arme somente com partição armada e Desarme somente sem partições armadas", () => {
    expect(isIntelbrasPhysicalStateConfirmed("arm", 0x03)).toBe(true);
    expect(isIntelbrasPhysicalStateConfirmed("arm", 0x00)).toBe(false);
    expect(isIntelbrasPhysicalStateConfirmed("disarm", 0x00)).toBe(true);
    expect(isIntelbrasPhysicalStateConfirmed("disarm", 0x01)).toBe(false);
  });
});
