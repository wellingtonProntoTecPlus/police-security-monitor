import { describe, expect, it } from "vitest";
import { getAutomaticEventAction } from "./autoFinalization";
import { isClientDisconnectedE365 } from "../../shared/clientDisconnectRestoration";
import { getConfiguredRestorationWaitSeconds, getRestorationWaitUntil, isRestorationWaitExpired } from "../../shared/restorationWaitPolicy";

describe("decisões de finalização automática", () => {
  it("envia para relatório sem abrir atendimento quando abre_tela é zero e não há pareamento", () => {
    expect(getAutomaticEventAction("E", { abreTela: 0 })).toBe("report_only");
  });

  it("persiste para restauração falhas explicitamente pareadas mesmo com abre_tela zero", () => {
    expect(getAutomaticEventAction("E", { abreTela: 0, fechaComRestauracao: 1 })).toBe("track_for_restoration");
  });

  it("mantém o evento em rastreamento quando deve fechar com restauração", () => {
    expect(getAutomaticEventAction("E", { abreTela: 1, fechaComRestauracao: 1 })).toBe("track_for_restoration");
  });

  it("tenta fechar ocorrência pendente ao receber uma restauração sem abertura configurada", () => {
    expect(getAutomaticEventAction("R", {})).toBe("try_restoration");
  });

  it("tenta fechar restauração mesmo quando o cadastro marca abre_tela como zero", () => {
    expect(getAutomaticEventAction("R", { abreTela: 0 })).toBe("try_restoration");
  });

  it("envia eventos comuns para a fila", () => {
    expect(getAutomaticEventAction("E", { abreTela: 1, fechaComRestauracao: 0 })).toBe("queue");
  });

  it("mantém na fila evento analítico direcional com qualifier R marcado para disparo", () => {
    expect(getAutomaticEventAction("R", { abreTela: 1, fechaComRestauracao: 0 })).toBe("queue");
  });

  it("usa somente o tempo positivo configurado em falhas E que aguardam restauração", () => {
    expect(getConfiguredRestorationWaitSeconds({ qualifier: "E", fechaComRestauracao: 1, tempoEsperaSegundos: 1800 })).toBe(1800);
    expect(getConfiguredRestorationWaitSeconds({ qualifier: "E", fechaComRestauracao: 1, tempoEsperaSegundos: 180 })).toBe(180);
    expect(getConfiguredRestorationWaitSeconds({ qualifier: "E", fechaComRestauracao: 0, tempoEsperaSegundos: 180 })).toBe(0);
    expect(getConfiguredRestorationWaitSeconds({ qualifier: "R", fechaComRestauracao: 1, tempoEsperaSegundos: 180 })).toBe(0);
    expect(getConfiguredRestorationWaitSeconds({ qualifier: "E", fechaComRestauracao: 1, tempoEsperaSegundos: -1 })).toBe(0);
  });

  it("calcula e verifica a expiração do prazo inclusivamente", () => {
    const receivedAt = new Date("2026-11-18T12:00:00.000Z");
    const until = getRestorationWaitUntil(receivedAt, 180);
    expect(until).toEqual(new Date("2026-11-18T12:03:00.000Z"));
    expect(isRestorationWaitExpired(until, new Date("2026-11-18T12:02:59.999Z"))).toBe(false);
    expect(isRestorationWaitExpired(until, until!)).toBe(true);
  });

  it("reconhece E365 Cliente Desconectado mas não outros usos do código 365", () => {
    expect(isClientDisconnectedE365({ qualifier: "E", eventCode: "365", description: "Cliente Desconectado" })).toBe(true);
    expect(isClientDisconnectedE365({ qualifier: "E", eventCode: "365", description: "CLIENTE DESCONECTADA" })).toBe(true);
    expect(isClientDisconnectedE365({ qualifier: "E", eventCode: "365", description: "Problema de módulo de Ethernet" })).toBe(false);
    expect(isClientDisconnectedE365({ qualifier: "R", eventCode: "365", description: "Cliente Desconectado" })).toBe(false);
    expect(isClientDisconnectedE365({ qualifier: "E", eventCode: "369", description: "Cliente Desconectado" })).toBe(false);
  });
});
