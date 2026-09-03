import { describe, expect, it } from "vitest";
import { buildRemoteCommandIncidentNotes, isConfirmedRemoteCommandEventMatch } from "./remoteCommandEventCorrelation";

const confirmedDisarm = {
  brand: "VETTI",
  commandType: "disarm",
  transportMode: "vsec_bench",
  status: "sent",
  panelConfirmedAt: new Date("2026-09-03T13:27:20.000Z"),
  remoteEventId: null,
};

describe("correlação de evento com comando remoto", () => {
  it("abre atendimento somente para o E401 Vetti próximo ao Desarme físico confirmado", () => {
    expect(isConfirmedRemoteCommandEventMatch(confirmedDisarm, {
      brand: "VETTI",
      qualifier: "E",
      eventCode: "401",
      receivedAt: new Date("2026-09-03T13:27:45.000Z"),
    })).toBe(true);
  });

  it("não atribui evento de outra ação, retransmissão, central ou momento", () => {
    const disarmWithEvent = { ...confirmedDisarm, remoteEventId: 99 };
    const mismatches = [
      { ...confirmedDisarm, brand: "COMPATEC" },
      disarmWithEvent,
    ];
    for (const command of mismatches) {
      expect(isConfirmedRemoteCommandEventMatch(command, {
        brand: "VETTI", qualifier: "E", eventCode: "401", receivedAt: new Date("2026-09-03T13:27:45.000Z"),
      })).toBe(false);
    }
    expect(isConfirmedRemoteCommandEventMatch(confirmedDisarm, {
      brand: "VETTI", qualifier: "R", eventCode: "401", receivedAt: new Date("2026-09-03T13:27:45.000Z"),
    })).toBe(false);
    expect(isConfirmedRemoteCommandEventMatch(confirmedDisarm, {
      brand: "VETTI", qualifier: "E", eventCode: "401", receivedAt: new Date("2026-09-03T13:29:00.000Z"),
    })).toBe(false);
  });

  it("aceita o evento que chega após a consulta posterior já ter fechado o comando", () => {
    expect(isConfirmedRemoteCommandEventMatch({ ...confirmedDisarm, status: "responded" }, {
      brand: "VETTI", qualifier: "E", eventCode: "401", receivedAt: new Date("2026-09-03T13:27:45.000Z"),
    })).toBe(true);
  });

  it("gera contexto compacto para o atendimento sem incluir credenciais", () => {
    const notes = buildRemoteCommandIncidentNotes({
      commandId: 32,
      commandLabel: "Desarme remoto Vetti",
      requestedBy: "Wellington de Sousa Portes",
      technicalUserCode: "399",
      panelUser: "001",
    });
    expect(notes).toContain("Solicitado por: Wellington de Sousa Portes");
    expect(notes).toContain("Usuário informado pela central: 001");
    expect(notes).toContain("Usuário técnico do comando: 399");
    expect(notes).not.toContain("senha");
  });
});
