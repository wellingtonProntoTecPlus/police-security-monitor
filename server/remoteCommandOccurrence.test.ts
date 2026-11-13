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

  it("registra KA4[4] como resposta recebida, sem afirmar estado final confirmado", () => {
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
    expect(occurrence.description).toContain("Resposta KA4 recebida");
    expect(occurrence.description).toContain("não confirma o estado final");
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

  it("registra Inibir Zona e o ACK KA1 sem afirmar que o bypass foi confirmado", () => {
    const occurrence = buildRemoteCommandOccurrenceText({
      commandId: 64,
      commandType: "isolate_zone",
      operatorName: "Amanda",
      requestedBy: "Sr. Wellington",
      zoneNumber: 23,
      reason: "Janela em manutenção",
      status: "responded",
      response: "MB=KA1",
    });
    expect(occurrence.description).toContain("Inibição de zona via PoliceCentral");
    expect(occurrence.description).toContain("Resposta KA1 recebida");
    expect(occurrence.description).toContain("não confirmação do estado final do bypass");
    expect(occurrence.observations).toContain("Operador: Amanda");
    expect(occurrence.observations).toContain("Solicitado por: Sr. Wellington");
    expect(occurrence.observations).toContain("Zona: 23");
    expect(occurrence.observations).not.toContain("Confirmado pela central.");
  });

  it("distingue Restaurar Zona do isolamento e preserva o solicitante no atendimento", () => {
    expect(getRemoteCommandActionLabel("restore_zone")).toBe("Restauração de zona via PoliceCentral");
    expect(getRemoteCommandOutcomeLabel("responded", "restore_zone")).toContain("não confirmação do estado final do bypass");
    const note = buildRemoteCommandIncidentNotes({
      commandId: 65,
      commandLabel: "Restauração de zona via PoliceCentral",
      commandType: "restore_zone",
      requestedBy: "Operador autenticado",
      requesterName: "Cliente",
      zoneNumber: 1,
      response: "MB=KA1",
    });
    expect(note).toContain("RESPOSTA KA1 RECEBIDA");
    expect(note).toContain("Solicitado por: Cliente");
    expect(note).toContain("não confirma o estado final do bypass");
    expect(note).not.toContain("CONFIRMADO]");
  });

  it("distingue comando aguardando conexão de comando enviado", () => {
    expect(getRemoteCommandOutcomeLabel("waiting_connection")).toBe("Ainda não enviado; aguardando conexão autenticada da central.");
    expect(getRemoteCommandOutcomeLabel("sent")).toBe("Enviado à central; aguardando confirmação.");
  });

  it("mantém a compatibilidade de notas não Compatec sem resposta KA4", () => {
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

  it("não chama KA4 curto de confirmação de Arme e preserva a resposta literal", () => {
    const occurrence = buildRemoteCommandOccurrenceText({
      commandId: 90,
      commandType: "arm",
      operatorName: "Wellington",
      reason: "Teste autorizado",
      status: "responded",
      response: "MB=KA1 recebido para AK2→AK1; aguardando KA4.\nMB=KA4",
    });
    const incidentNote = buildRemoteCommandIncidentNotes({
      commandId: 90,
      commandLabel: "Arme Compatec",
      commandType: "arm",
      requestedBy: "Wellington",
      reason: "Teste autorizado",
      response: "MB=KA4",
    });
    expect(occurrence.description).toContain("Resposta KA4 recebida");
    expect(occurrence.description).not.toContain("Confirmado pela central");
    expect(occurrence.observations).toContain("Resposta da central: MB=KA1 recebido para AK2→AK1; aguardando KA4.\nMB=KA4");
    expect(incidentNote).toContain("RESPOSTA KA4 RECEBIDA");
    expect(incidentNote).toContain("não confirma o estado final do Arme/Desarme");
    expect(incidentNote).not.toContain("CONFIRMADO]");
  });
});
