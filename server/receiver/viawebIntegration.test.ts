import { describe, expect, it } from "vitest";
import { __testables, buildIsepAuthorizationOperation, parseViawebEvent } from "./viawebIntegration";

describe("integração oficial ViaWeb", () => {
  it("normaliza um evento Contact ID de alarme pelo ISEP hexadecimal", () => {
    expect(parseViawebEvent({
      id: "21-evt",
      acao: "evento",
      codigoEvento: "1130",
      particao: 3,
      zonaUsuario: 9,
      contaCliente: "0337",
      isep: "f301",
      ip: "198.51.100.22",
    })).toMatchObject({
      operationId: "21-evt",
      isep: "F301",
      requiresAuthorization: false,
      internalEventType: null,
      qualifier: "E",
      eventCode: "130",
      partition: "3",
      zoneUser: "9",
      receivedAccount: "0337",
      remoteIp: "198.51.100.22",
    });
  });

  it("normaliza uma restauração e rejeita ISEP ou Contact ID inválidos", () => {
    expect(parseViawebEvent({ id: 22, acao: "evento", codigoEvento: "3130", isep: "F301", eventoInterno: 3 }))
      .toMatchObject({ operationId: "22", qualifier: "R", eventCode: "130", requiresAuthorization: true, internalEventType: 3 });
    expect(parseViawebEvent({ id: 23, acao: "evento", codigoEvento: "1130", isep: "LYUL" })).toBeNull();
    expect(parseViawebEvent({ id: 24, acao: "evento", codigoEvento: "E130", isep: "F301" })).toBeNull();
  });

  it("preserva JSON fracionado e prepara somente identificação e recepção de eventos", () => {
    const first = __testables.extractJsonMessages('{"resp":[{"id":"1"}]}{"oper":');
    expect(first.messages).toEqual(['{"resp":[{"id":"1"}]}']);
    expect(first.remainder).toBe('{"oper":');
    const handshake = __testables.integrationHandshake();
    expect(handshake.oper.map(operation => operation.acao)).toEqual(["ident", "salvarVIAWEB"]);
    expect(JSON.stringify(handshake)).not.toContain("executar");
    expect(handshake.oper[1]).toMatchObject({ porta: 9111, monitoramento: 1, filtroEvento: 255, filtroRestauro: 255 });
  });

  it("autoriza exclusivamente o ISEP que solicitou conexão e não prepara comandos físicos", () => {
    const pendingAuthorization = parseViawebEvent({
      id: "101-evt",
      acao: "evento",
      codigoEvento: "1AA5",
      eventoInterno: 3,
      isep: "F301",
    });
    expect(pendingAuthorization).not.toBeNull();
    expect(buildIsepAuthorizationOperation(pendingAuthorization!)).toEqual({
      id: "policecentral-authorize-101-evt",
      acao: "salvarCliente",
      operacao: 2,
      porta: 9111,
      idISEP: "F301",
      autorizacao: 1,
    });
    expect(JSON.stringify(buildIsepAuthorizationOperation(pendingAuthorization!))).not.toContain("executar");
    const normalEvent = parseViawebEvent({ id: "102-evt", acao: "evento", codigoEvento: "1130", isep: "F301" });
    expect(buildIsepAuthorizationOperation(normalEvent!)).toBeNull();
  });
});
