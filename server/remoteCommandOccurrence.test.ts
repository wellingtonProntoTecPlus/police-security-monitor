import { describe, expect, it } from "vitest";
import {
  buildRemoteCommandIncidentNotes,
  buildRemoteCommandOccurrenceText,
  buildRemoteCommandRequestNote,
  getRemoteCommandActionLabel,
} from "./remoteCommandEventCorrelation";

describe("auditoria de comandos remotos", () => {
  it("identifica Arme e Desarme como ações da Central de Monitoramento", () => {
    expect(getRemoteCommandActionLabel("arm")).toBe("Armado Remoto por Central de Monitoramento");
    expect(getRemoteCommandActionLabel("disarm")).toBe("Desarmado Remoto por Central de Monitoramento");
  });

  it("registra operador, motivo e espera de confirmação na ocorrência", () => {
    const note = buildRemoteCommandRequestNote({
      commandId: 41,
      commandType: "disarm",
      operatorName: "Wellington de Sousa Portes",
      reason: "desarmado para entrada de funcionários",
    });

    expect(note).toContain("[COMANDO REMOTO SOLICITADO]");
    expect(note).toContain("Origem: Central de Monitoramento");
    expect(note).toContain("Operador: Wellington de Sousa Portes");
    expect(note).toContain("Motivo: desarmado para entrada de funcionários");
    expect(note).toContain("Status: aguardando confirmação da central.");
    expect(note).toContain("Auditoria do comando: #41");
  });

  it("gera uma ocorrência finalizada somente para a confirmação remota", () => {
    const occurrence = buildRemoteCommandOccurrenceText({
      commandId: 42,
      commandType: "arm",
      operatorName: "Operador da noite",
      reason: "Armado a pedido do Sr Wellington",
      response: "MB=KA4[4]",
    });

    expect(occurrence).toEqual({
      eventCode: "REMOTE",
      qualifier: null,
      description: "Armado Remoto por Central de Monitoramento",
      observations: expect.stringContaining("Confirmação recebida da central."),
    });
    expect(occurrence.observations).toContain("Origem: Central de Monitoramento");
    expect(occurrence.observations).toContain("Operador: Operador da noite");
    expect(occurrence.observations).toContain("Auditoria do comando: #42");
  });

  it("mantém o texto de confirmação compatível com o atendimento existente", () => {
    const note = buildRemoteCommandIncidentNotes({
      commandId: 43,
      commandLabel: "Desarmado Remoto por Central de Monitoramento",
      requestedBy: "Operador autenticado",
    });

    expect(note).toContain("[COMANDO REMOTO CONFIRMADO]");
    expect(note).toContain("Origem: Central de Monitoramento");
    expect(note).toContain("Operador: Operador autenticado");
    expect(note).toContain("Auditoria do comando: #43");
  });
});
