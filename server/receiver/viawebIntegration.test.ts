import { describe, expect, it } from "vitest";
import { __testables, buildIsepAuthorizationOperation, parseViawebClientStatuses, parseViawebEvent, readPreauthorizedIseps, summarizeViawebReceiverMessage } from "./viawebIntegration";

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
    const handshake = __testables.integrationHandshake(["F301"]);
    expect(handshake.oper.map(operation => operation.acao)).toEqual(["ident", "salvarVIAWEB", "salvarCliente", "listarClientes"]);
    expect(JSON.stringify(handshake)).not.toContain("executar");
    expect(handshake.oper[1]).toMatchObject({ porta: 9111, monitoramento: 1, filtroEvento: 255, filtroRestauro: 255 });
    expect(handshake.oper[2]).toMatchObject({ idISEP: "F301", autorizacao: 1, porta: 9111 });
  });

  it("aceita apenas ISEPs hexadecimais distintos na pré-autorização", () => {
    expect(readPreauthorizedIseps("F301, f301,LYUL,A0F9,123")).toEqual(["F301", "A0F9"]);
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

  it("reconhece apenas status autenticado de cliente ViaWeb para supervisão", () => {
    expect(parseViawebClientStatuses({
      resp: [{
        viaweb: [{
          cliente: [
            { idISEP: "F301", online: 1, meio: [{ online: 1, ip: "189.101.32.9" }] },
            { idISEP: "LYUL", online: 1 },
            { idISEP: "A0F9", online: 0, meio: [] },
          ],
        }],
      }],
    })).toEqual([
      { isep: "F301", online: true, remoteIp: "189.101.32.9" },
      { isep: "A0F9", online: false, remoteIp: "127.0.0.1" },
    ]);
  });

  it("resume a estrutura recebida sem expor campos de credencial", () => {
    const summary = summarizeViawebReceiverMessage({
      oper: [{ acao: "evento", isep: "F301", codigoEvento: "1603", eventoInterno: 0, senha: "não-expor" }],
      token: "não-expor",
      resp: [],
    });
    expect(summary).toContain("evento(ISEP:F301, código:1603, interno:0)");
    expect(summary).not.toMatch(/senha|token|não-expor/i);
  });
});
