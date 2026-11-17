import { describe, expect, it } from "vitest";
import { getOperatorFacingIncidentNotes } from "./operatorFacingIncidentNotes";
import { buildRemoteCommandIncidentNotes, buildRemoteCommandOccurrenceText, buildRemoteCommandRequestNote } from "../../../server/remoteCommandEventCorrelation";

const request = buildRemoteCommandRequestNote({ commandId: 109, commandType: "arm", operatorName: "Wellington", reason: "Teste autorizado\nCentral de bancada." });
const response = buildRemoteCommandIncidentNotes({ commandId: 109, commandType: "arm", commandLabel: "Arme remoto", operatorName: "Wellington", reason: "Teste autorizado", response: "MB=KA4" });

describe("notas operacionais sem blocos técnicos de comandos", () => {
  it("preserva notas humanas antes, entre e depois dos blocos reais", () => {
    const raw = ["Nota anterior.", request, "Cliente pediu verificação.", response, "Tático retornou sem anormalidades."].join("\n");
    expect(getOperatorFacingIncidentNotes(raw)).toBe("Nota anterior.\nCliente pediu verificação.\nTático retornou sem anormalidades.");
    expect(raw).toContain("Auditoria do comando: #109");
  });

  it("esconde o bloco técnico completo mesmo sem notas humanas", () => {
    expect(getOperatorFacingIncidentNotes(request)).toBe("");
    expect(getOperatorFacingIncidentNotes(response)).toBe("");
  });

  it("preserva texto humano após blocos CRLF com resposta multilinha", () => {
    const note = buildRemoteCommandIncidentNotes({ commandId: 110, commandType: "configure_zones", commandLabel: "Configuração", operatorName: "Operador", response: "MB=KA1\nSegunda linha da resposta", zoneChanges: [{ zoneNumber: 2, bypassState: "annulled" }] });
    const raw = ["Antes.", note, "Depois."].join("\n").replace(/\n/g, "\r\n");
    expect(getOperatorFacingIncidentNotes(raw).replace(/\r\n/g, "\n")).toBe("Antes.\nDepois.");
  });

  it("não usa rodapé de outro comando para apagar um bloco incompleto", () => {
    const incomplete = "[COMANDO REMOTO #108 SOLICITADO]\nAnotação preservada.\nAuditoria do comando: #109";
    expect(getOperatorFacingIncidentNotes([incomplete, request, "Nota final."].join("\n"))).toBe(`${incomplete}\nNota final.`);
  });

  it("mantém integralmente texto humano ou bloco incompleto sem rodapé", () => {
    const raw = "[COMANDO REMOTO #109 SOLICITADO]\nRegistro incompleto.\nNão excluir anotação humana.";
    expect(getOperatorFacingIncidentNotes(raw)).toBe(raw);
    expect(getOperatorFacingIncidentNotes("Nota humana comum.")).toBe("Nota humana comum.");
  });

  it("reconhece também o marcador sem sufixo do registro de relatório", () => {
    const note = buildRemoteCommandOccurrenceText({ commandId: 111, commandType: "disarm", operatorName: "Operador", reason: "Solicitação do cliente", status: "sent" }).observations;
    expect(getOperatorFacingIncidentNotes(`${note}\nNota humana posterior.`)).toBe("Nota humana posterior.");
  });

  it("aceita notas vazias e ausentes", () => {
    expect(getOperatorFacingIncidentNotes(null)).toBe("");
    expect(getOperatorFacingIncidentNotes(undefined)).toBe("");
    expect(getOperatorFacingIncidentNotes("")).toBe("");
  });
});
