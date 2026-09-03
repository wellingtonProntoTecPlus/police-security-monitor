import { describe, expect, it } from "vitest";
import { hasValidIsecnetChecksum, parseIntelbrasIsecnetIdentification } from "./intelbrasIsecnetProtocol";

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
