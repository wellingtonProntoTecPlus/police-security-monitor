import { describe, expect, it } from "vitest";
import { extractIntelbrasIsecnetFrames, hasValidIsecnetChecksum, normalizeIntelbrasContactIdEventCode, parseIntelbrasIsecnetEvent, parseIntelbrasIsecnetIdentification } from "./intelbrasIsecnetProtocol";

function withIsecnetChecksum(frameWithoutChecksum: number[]) {
  const frame = Buffer.from([...frameWithoutChecksum, 0]);
  let checksum = 0;
  for (let index = 0; index < frame.length - 1; index += 1) checksum ^= frame[index];
  frame[frame.length - 1] = checksum ^ 0xff;
  return frame;
}

describe("identificação ISECnet Intelbras 0x94", () => {
  const capturedAmt8000Frame = Buffer.from("07944500497B255F61", "hex");

  it("valida e extrai canal, conta e MAC parcial da AMT-8000 capturada", () => {
    expect(hasValidIsecnetChecksum(capturedAmt8000Frame)).toBe(true);
    expect(parseIntelbrasIsecnetIdentification(capturedAmt8000Frame)).toEqual({
      channel: "E",
      account: "0049",
      macSuffix: "7B255F",
    });
  });

  it("recusa quadro 0x94 com checksum inválido para não associar uma central indevidamente", () => {
    const corrupted = Buffer.from(capturedAmt8000Frame);
    corrupted[8] = 0x60;

    expect(hasValidIsecnetChecksum(corrupted)).toBe(false);
    expect(parseIntelbrasIsecnetIdentification(corrupted)).toBeUndefined();
  });

  it("recusa formatos ISECnet diferentes de 0x94 nesta etapa de homologação", () => {
    expect(parseIntelbrasIsecnetIdentification(Buffer.from("07B04500497B255F45", "hex"))).toBeUndefined();
  });
});

describe("eventos ISECnet Intelbras 0xB0 e 0xB4", () => {
  const b0Event = withIsecnetChecksum([0x11, 0xb0, 0x11, 0x00, 0x00, 0x04, 0x09, 0x01, 0x08, 0x01, 0x01, 0x03, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x01]);
  const b0EventUser198 = withIsecnetChecksum([0x11, 0xb0, 0x11, 0x00, 0x00, 0x04, 0x09, 0x01, 0x08, 0x01, 0x04, 0x00, 0x07, 0x0a, 0x0a, 0x01, 0x09, 0x08]);
  const b4Event = withIsecnetChecksum([0x1d, 0xb4, 0x11, 0x00, 0x00, 0x04, 0x09, 0x01, 0x08, 0x03, 0x01, 0x03, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x01, 0x0f, 0x06, 0x11, 0x0c, 0x03, 0x18, 0x0f, 0x06, 0x11, 0x0c, 0x03, 0x18]);

  it("extrai o evento 130 e mantém qualificador E separado do código", () => {
    expect(parseIntelbrasIsecnetEvent(b0Event)).toEqual({
      account: "0049",
      qualifier: "E",
      eventCode: "130",
      partition: "00",
      zoneUser: "001",
      command: "0xB0",
    });
  });

  it("reconhece restauração em 0xB4 sem alterar o código Contact ID", () => {
    expect(parseIntelbrasIsecnetEvent(b4Event)).toMatchObject({
      account: "0049",
      qualifier: "R",
      eventCode: "130",
      command: "0xB4",
    });
  });

  it("preserva os três dígitos do usuário informado pela central", () => {
    expect(parseIntelbrasIsecnetEvent(b0EventUser198)).toMatchObject({
      account: "0049",
      qualifier: "E",
      eventCode: "407",
      zoneUser: "198",
      command: "0xB0",
    });
  });

  it("normaliza a notação 1130 para 130, mantendo E ou R em campo próprio", () => {
    expect(normalizeIntelbrasContactIdEventCode("1130")).toBe("130");
    expect(normalizeIntelbrasContactIdEventCode("130")).toBe("130");
  });

  it("suporta quadros ISECnet recebidos de forma agrupada ou fragmentada", () => {
    const combined = Buffer.concat([b0Event, b4Event]);
    expect(extractIntelbrasIsecnetFrames(combined).frames).toEqual([b0Event, b4Event]);
    const fragmented = extractIntelbrasIsecnetFrames(b0Event.subarray(0, 12));
    expect(fragmented.frames).toEqual([]);
    expect(fragmented.remainder).toEqual(b0Event.subarray(0, 12));
  });

  it("recusa evento com checksum inválido antes de qualquer persistência", () => {
    const invalid = Buffer.from(b0Event);
    invalid[18] ^= 0xff;
    expect(parseIntelbrasIsecnetEvent(invalid)).toBeUndefined();
  });
});
