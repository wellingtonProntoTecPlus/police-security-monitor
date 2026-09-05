import { describe, expect, it } from "vitest";
import {
  buildJflActive8wConnectionAcknowledgement,
  buildJflStatusRequest,
  isJflActive8wV8Connection,
  isJflActive8wV8StatusReply,
} from "./jflActive8wProtocol";

const ACTIVE_8W_0029_CONNECTION = Buffer.from(
  "7A006C9F002132383335333631323734FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF454345333334323938383734A9373830010101060000010001000200000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000B3",
  "hex",
);

const ACTIVE_8W_0022_STATUS_REPLY = Buffer.from(
  "7A0090240024303032323331333030313030310000004F020030300409261809315043656E7472616C2042617465726961735A4C6F6A61FFFFFFFFFFFFFFFFFFFFFFFF00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000E7",
  "hex",
);

const JFL_CONTACT_ID_EVENT = Buffer.from("7B1871243030303133343037303130393900000489020089", "hex");

describe("infraestrutura de conexão da JFL Active 8W v8", () => {
  it("reconhece somente o quadro 7A/0x21 e retorna a confirmação esperada", () => {
    expect(isJflActive8wV8Connection(ACTIVE_8W_0029_CONNECTION)).toBe(true);
    expect(buildJflActive8wConnectionAcknowledgement(ACTIVE_8W_0029_CONNECTION)?.toString("hex").toUpperCase())
      .toBe("7B07012101015C");
  });

  it("nunca transforma um comando Contact ID legado em confirmação Active 8W", () => {
    expect(buildJflActive8wConnectionAcknowledgement(Buffer.from("7B18242430303031", "hex"))).toBeUndefined();
  });

  it("reconhece a resposta 7A/0x24 de status e nunca a confunde com Contact ID", () => {
    expect(isJflActive8wV8StatusReply(ACTIVE_8W_0022_STATUS_REPLY)).toBe(true);
    expect(isJflActive8wV8StatusReply(JFL_CONTACT_ID_EVENT)).toBe(false);
  });

  it("monta somente uma consulta passiva de estado, sem comando físico", () => {
    expect(buildJflStatusRequest().toString("hex").toUpperCase()).toBe("7B05014D32");
  });
});
