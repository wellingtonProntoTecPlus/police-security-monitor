import { describe, expect, it } from "vitest";
import { isVettiKeepAliveFrame, parseVettiLoginIdentity, resolveVettiEventAccount } from "./vettiProtocol";

describe("protocolo Vetti", () => {
  it("reconhece F7 isolado como Keep Alive sem confundir com quadro de login", () => {
    expect(isVettiKeepAliveFrame(Buffer.from([0xF7]))).toBe(true);
    expect(isVettiKeepAliveFrame(Buffer.from([0x02, 0x09, 0xC0, 0x42]))).toBe(false);
  });

  it("extrai conta e MAC do login C0 confirmado na central da conta 0336", () => {
    const login = Buffer.from("0209C04203362DE4A88F", "hex");

    expect(parseVettiLoginIdentity(login)).toEqual({ account: "0336", macSuffix: "2DE4A8" });
  });

  it("não interpreta os bytes 0A03 do evento C1 como conta quando houve login", () => {
    const login = parseVettiLoginIdentity(Buffer.from("0209C04203362DE4A88F", "hex"));
    const event = Buffer.from("0213C1400A030306010801030A050A0A0A04DA", "hex");

    expect(resolveVettiEventAccount(event, login)).toBe("0336");
    expect(resolveVettiEventAccount(event)).toBe("0A03");
  });
});
