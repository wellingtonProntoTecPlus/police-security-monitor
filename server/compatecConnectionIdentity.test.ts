import { describe, expect, it } from "vitest";
import { compatecConnectionIdentityMatches, getCompatecConnectionIdentity } from "../shared/compatecConnectionIdentity";

describe("identidade de conexão Compatec", () => {
  it("exige MAC ou IMEI de seis hexadecimais e porta válida", () => {
    expect(getCompatecConnectionIdentity({ macAddress: "C1:BD:CB", receiverPort: 9271 })).toEqual({
      identifierType: "mac_ascii",
      identifier: "C1BDCB",
      receiverPort: 9271,
    });
    expect(getCompatecConnectionIdentity({ imeiGprs: "A1B2C3", receiverPort: 9271 })).toEqual({
      identifierType: "imei_ascii",
      identifier: "A1B2C3",
      receiverPort: 9271,
    });
    expect(getCompatecConnectionIdentity({ serialNumber: "123456", receiverPort: 9271 } as any)).toBeUndefined();
    expect(getCompatecConnectionIdentity({ isepId: "A1B2C3", receiverPort: 9271 } as any)).toBeUndefined();
    expect(getCompatecConnectionIdentity({ macAddress: "C1BDCB", receiverPort: null })).toBeUndefined();
    expect(getCompatecConnectionIdentity({ macAddress: "C1BDCB", receiverPort: 65536 })).toBeUndefined();
  });

  it("confere o campo realmente capturado e a porta, mesmo quando MAC e IMEI estão cadastrados", () => {
    expect(compatecConnectionIdentityMatches(
      { macAddress: "BBBBBB", imeiGprs: "A1B2C3", receiverPort: 9271 },
      { identifierType: "imei_ascii", identifier: "A1B2C3", receiverPort: 9271 },
    )).toBe(true);
    expect(compatecConnectionIdentityMatches(
      { macAddress: "BBBBBB", imeiGprs: "A1B2C3", receiverPort: 9272 },
      { identifierType: "imei_ascii", identifier: "A1B2C3", receiverPort: 9271 },
    )).toBe(false);
    expect(compatecConnectionIdentityMatches(
      { macAddress: "CCCCCC", receiverPort: 9271 },
      { identifierType: "mac_ascii", identifier: "C1BDCB", receiverPort: 9271 },
    )).toBe(false);
  });
});
