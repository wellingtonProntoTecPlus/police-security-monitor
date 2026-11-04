import { describe, expect, it } from "vitest";
import {
  buildRemoteCommandIncidentNotes,
  buildRemoteCommandOccurrenceText,
  buildRemoteCommandRequestNote,
  getRemoteCommandActionLabel,
  getRemoteCommandOutcomeLabel,
} from "./remoteCommandEventCorrelation";

describe("auditoria de comandos remotos", () => {
  it("identifica Arme e Desarme como ações da Central de Monitoramento", () => {
    expect(getRemoteCommandActionLabel("arm")).toBe("Arme remoto via PoliceCentral");
    expect(getRemoteCommandActionLabel("disarm")).toBe("Desarme remoto via PoliceCentral");
  });

  it("registra operador, motivo e espera de confirmação na ocorrência", () => {
    const note = buildRemoteCommandRequestNote({
      commandId: 41,
      commandType: "disarm",
      operatorName: "Wellington de Sousa Portes",
      reason: "desarmado para entrada de funcionários",
    });

    expect(note).toContain("[COMANDO REMOTO #41 SOLICITADO]");
    expect(note).toContain("Origem: PoliceCentral (Central de Monitoramento)");
    expect(note).toContain("Operador: Wellington de Sousa Portes");
    expect(note).toContain("Motivo: desarmado para entrada de funcionários");
    expect(note).toContain("Resultado: aguardando envio e confirmação da central.");
    expect(note).toContain("Auditoria do comando: #41");
  });

  it("gera uma ocorrência identificável no relatório quando o painel confirma", () => {
    const occurrence = buildRemoteCommandOccurrenceText({
      commandId: 42,
      commandType: "arm",
      operatorName: "Operador da noite",
      reason: "Armado a pedido do Sr Wellington",
      status: "responded",
      response: "MB=KA4[4]",
    });

    expect(occurrence.eventCode).toBe("REMOTE");
    expect(occurrence.qualifier).toBeNull();
    expect(occurrence.description).toContain("Arme remoto via PoliceCentral");
    expect(occurrence.description).toContain("Confirmado pela central");
    expect(occurrence.observations).toContain("[COMANDO REMOTO #42]");
    expect(occurrence.observations).toContain("Origem: PoliceCentral (Central de Monitoramento)");
    expect(occurrence.observations).toContain("Operador: Operador da noite");
    expect(occurrence.observations).toContain("Motivo: Armado a pedido do Sr Wellington");
    expect(occurrence.observations).toContain("Resposta da central: MB=KA4[4]");
    expect(occurrence.observations).toContain("Auditoria do comando: #42");
  });

  it("registra resposta incompatível como falha, sem chamá-la de confirmação", () => {
    const occurrence = buildRemoteCommandOccurrenceText({
      commandId: 61,
      commandType: "arm",
      operatorName: "Amanda dos Santos Pereira",
      reason: "Horário",
      status: "failed",
      response: "MB=KA4",
    });

    expect(occurrence.description).toContain("Falha");
    expect(occurrence.observations).toContain("Resultado: Falha; a central não confirmou o comando.");
    expect(occurrence.observations).toContain("Resposta da central: MB=KA4");
    expect(occurrence.observations).not.toContain("Confirmado pela central.");
  });

  it("distingue comando aguardando conexão de comando enviado", () => {
    expect(getRemoteCommandOutcomeLabel("waiting_connection")).toBe("Ainda não enviado; aguardando conexão autenticada da central.");
    expect(getRemoteCommandOutcomeLabel("sent")).toBe("Enviado à central; aguardando confirmação.");
  });

  it("mantém o texto de confirmação compatível com o atendimento existente", () => {
    const note = buildRemoteCommandIncidentNotes({
      commandId: 43,
      commandLabel: "Desarmado Remoto por Central de Monitoramento",
      requestedBy: "Operador autenticado",
    });

    expect(note).toContain("[COMANDO REMOTO #43 CONFIRMADO]");
    expect(note).toContain("Origem: PoliceCentral (Central de Monitoramento)");
    expect(note).toContain("Operador: Operador autenticado");
    expect(note).toContain("Auditoria do comando: #43");
  });
});
