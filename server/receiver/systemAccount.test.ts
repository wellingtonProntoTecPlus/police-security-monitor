import { describe, expect, it } from "vitest";
import { resolveSystemAccount } from "./systemAccount";

describe("Conta do Sistema", () => {
  it("preserva a conta de uma central cadastrada", () => {
    expect(resolveSystemAccount("0001", true)).toEqual({ account: "0001", receivedAccount: "0001", isSystemAccount: false });
  });

  it("direciona central sem conta para a conta técnica 0000", () => {
    expect(resolveSystemAccount("", false)).toEqual({ account: "0000", receivedAccount: "", isSystemAccount: true });
  });

  it("direciona conta recebida de central desconhecida para 0000 e preserva o valor original", () => {
    expect(resolveSystemAccount("1234", false)).toEqual({ account: "0000", receivedAccount: "1234", isSystemAccount: true });
  });
});
