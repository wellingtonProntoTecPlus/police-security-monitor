import { describe, expect, it } from "vitest";
import { getOperatorFacingIncidentNotes } from "./operatorFacingIncidentNotes";
import { buildRemoteCommandIncidentNotes, buildRemoteCommandOccurrenceText, buildRemoteCommandRequestNote } from "../../../server/remoteCommandEventCorrelation";
import { buildCompactRemoteCommandSummary } from "@shared/remoteCommandAuditSummary";

const request = buildRemoteCommandRequestNote({ commandId: 109, commandType: "arm", operatorName: "Wellington", reason: "Teste autorizado" });
const response = buildRemoteCommandIncidentNotes({ commandId: 109, commandType: "arm", commandLabel: "Arme remoto", operatorName: "Wellington", reason: "Teste autorizado", response: "MB=KA4" });

describe("resumo operacional de comandos remotos", () => {
  it("reduz solicitação e resposta a no máximo duas linhas sem códigos, frames ou campos técnicos", () => {
    const summary = getOperatorFacingIncidentNotes([request, response].join("\n"));
    const lines = summary.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Arme");
    expect(lines[1]).toContain("Teste autorizado");
    expect(lines[1]).toContain("Resposta recebida; conferir estado final");
    expect(summary).not.toMatch(/COMANDO REMOTO|PoliceCentral|Operador:|Solicitado por|KA4|AK4|Auditoria do comando/);
    expect([request, response].join("\n")).toContain("Auditoria do comando: #109");
  });

  it("preserva notas humanas antes e depois do resumo de comandos", () => {
    const raw = ["Nota anterior.", request, "Cliente pediu verificação.", response, "Tático retornou sem anormalidades."].join("\n");
    const summary = getOperatorFacingIncidentNotes(raw);
    expect(summary).toContain("Nota anterior.");
    expect(summary).toContain("Cliente pediu verificação.");
    expect(summary).toContain("Tático retornou sem anormalidades.");
    expect(summary.split("\n")[0]).toContain("Comando: Arme");
  });

  it("preserves free human text between a legacy reason and its result line", () => {
    const notes = [
      "[COMANDO REMOTO #130 SOLICITADO]",
      "Ação: Arme remoto via PoliceCentral",
      "Motivo: Solicitação de rotina.",
      "O cliente pediu que confira também o portão lateral.",
      "Resultado: aguardando envio e resposta.",
      "Auditoria do comando: #130",
    ].join("\n");
    const summary = getOperatorFacingIncidentNotes(notes);
    expect(summary).toContain("O cliente pediu que confira também o portão lateral.");
    expect(summary).not.toMatch(/COMANDO REMOTO|PoliceCentral|Auditoria do comando/);
  });

  it("resume vários comandos em duas linhas e informa estados variados sem despejar entradas repetidas", () => {
    const commands = [
      buildRemoteCommandRequestNote({ commandId: 110, commandType: "configure_zones", operatorName: "Operador", reason: "Ativar interno", zoneChanges: [{ zoneNumber: 1, armState: "armed" }, { zoneNumber: 2, armState: "disarmed" }, { zoneNumber: 3, bypassState: "annulled" }] }),
      buildRemoteCommandIncidentNotes({ commandId: 110, commandType: "configure_zones", commandLabel: "Configuração", operatorName: "Operador", reason: "Ativar interno", response: "MB=KA1", zoneChanges: [{ zoneNumber: 1, armState: "armed" }, { zoneNumber: 2, armState: "disarmed" }, { zoneNumber: 3, bypassState: "annulled" }] }),
      buildRemoteCommandRequestNote({ commandId: 112, commandType: "disarm", operatorName: "Amanda", reason: "Cliente confirmado" }),
    ].join("\n");
    const summary = getOperatorFacingIncidentNotes(commands);
    expect(summary.split("\n")).toHaveLength(2);
    expect(summary).toContain("Comandos (2)");
    expect(summary).toContain("Alteração de setores 1, 2, 3");
    expect(summary).toContain("Desarme");
    expect(summary).toContain("Cliente confirmado");
    expect(summary).toContain("(+1 outro)");
    expect(summary).toContain("Resultados variados; confira o histórico");
    expect(summary).not.toMatch(/Setor \d+:|KA1|AK2|MB=|Origem:|Auditoria do comando/);
  });

  it("compacta bloco CRLF e resposta multilinha sem ocultar notas humanas posteriores", () => {
    const note = buildRemoteCommandIncidentNotes({ commandId: 113, commandType: "configure_zones", commandLabel: "Configuração", operatorName: "Operador", response: "MB=KA1\nSegunda linha da resposta", zoneChanges: [{ zoneNumber: 2, bypassState: "annulled" }] });
    const raw = ["Antes.", note, "Depois."].join("\n").replace(/\n/g, "\r\n");
    const summary = getOperatorFacingIncidentNotes(raw).replace(/\r\n/g, "\n");
    expect(summary).toContain("Antes.\nDepois.");
    expect(summary).toContain("Comando: Alteração de setores 2.");
    expect(summary).toContain("Resposta recebida; conferir estado final.");
    expect(summary).not.toContain("Segunda linha da resposta");
    expect(summary).not.toMatch(/KA1|MB=|Setor 2:|Auditoria do comando/);
  });

  it("resume bloco incompleto e preserva a nota humana quando o rodapé pertence a outro ID", () => {
    const incomplete = [
      "[COMANDO REMOTO #108 SOLICITADO]",
      "Ação: Arme remoto via PoliceCentral",
      "Origem: PoliceCentral",
      "Operador: Ana",
      "Motivo: Conferir antes de armar",
      "Resultado: aguardando envio e confirmação da central.",
      "MB=AK4[4]",
      "F7",
      "Próximo operador deve ligar após as 18 horas.",
      "Anotação humana: texto preservado dentro do registro legado.",
      "Auditoria do comando: #109",
    ].join("\n");
    const summary = getOperatorFacingIncidentNotes([incomplete, request, "Nota final."].join("\n"));
    expect(summary).toContain("Comandos (2)");
    expect(summary).toContain("Próximo operador deve ligar após as 18 horas.");
    expect(summary).toContain("Anotação humana: texto preservado dentro do registro legado.");
    expect(summary).toContain("Nota final.");
    expect(summary).not.toMatch(/COMANDO REMOTO|PoliceCentral|Operador:|AK4|F7|Auditoria do comando/);
  });

  it("resume bloco sem rodapé, remove frame e resposta técnica e conserva texto humano adjacente", () => {
    const incomplete = [
      "[COMANDO REMOTO #120 RESPOSTA KA4 RECEBIDA]",
      "Ação: Desarme remoto via PoliceCentral",
      "Motivo: Teste antigo",
      "Resultado: resposta KA4 recebida; não confirma o estado final.",
      "Resposta da central: MB=KA4[4]",
      "MB=KA4[4]",
      "AA BB CC DD EE FF 00 11",
      "Cliente informou que o pacote chega amanhã.",
      "Face",
      "Dada",
      "F7",
      "Cliente deixou a chave na portaria.",
      "Nota humana: conferir o estado na central.",
    ].join("\n");
    const summary = getOperatorFacingIncidentNotes(["Antes.", incomplete, "Nota humana: Depois."].join("\n"));
    expect(summary).toContain("Comando: Desarme.");
    expect(summary).toContain("Resposta recebida; conferir estado final");
    expect(summary).toContain("Nota humana: conferir o estado na central.");
    expect(summary).toContain("Cliente deixou a chave na portaria.");
    expect(summary).toContain("Antes.");
    expect(summary).toContain("Nota humana: Depois.");
    expect(summary).toContain("Cliente informou que o pacote chega amanhã.");
    expect(summary).toContain("Face");
    expect(summary).toContain("Dada");
    expect(summary).not.toContain("AA BB CC DD EE FF 00 11");
    expect(summary).not.toMatch(/COMANDO REMOTO|PoliceCentral|KA4|MB=|Resposta da central/);
  });

  it("cancellation summary never implies that the command was not physically transmitted", () => {
    const summary = buildCompactRemoteCommandSummary([{ commandType: "arm", status: "cancelled", reason: "Operador cancelou após desarme" }]);
    expect(summary).toContain("Cancelado; conferir histórico");
    expect(summary).not.toContain("sem envio");
  });

  it("reports verified non-application separately from a generic cancellation", () => {
    const summary = buildCompactRemoteCommandSummary([{
      commandType: "arm",
      status: "cancelled",
      reason: "Base autorizadora do Arme: Pedido do cliente",
      response: "[CANCELAMENTO APÓS VERIFICAÇÃO: NÃO APLICADO]\nOperador: Amanda\nConferência manual registrada.",
    }]);
    expect(summary).toContain("Não aplicado; conferência manual registrada");
    expect(summary).toContain("Motivo: Base: Pedido do cliente");
    expect(summary).not.toContain("Cancelado; conferir histórico");
    expect(summary).not.toContain("sem envio");
  });

  it("remove códigos e bytes de protocolo de motivos legados", () => {
    const summary = buildCompactRemoteCommandSummary([{ commandType: "arm", status: "responded", reason: "Conferir painel F7 07944500497B255F KA4" }]);
    expect(summary).toContain("Motivo: Conferir painel");
    expect(summary).not.toMatch(/F7|07944500497B255F|KA4/);
  });

  it("does not report receipt when a legacy result explicitly says it was not received or confirmed", () => {
    for (const result of [
      "Comando não confirmado pela central.",
      "Sem resposta recebida.",
      "Não houve resposta recebida.",
      "Não houve confirmação recebida.",
    ]) {
      const notes = [
        "[COMANDO REMOTO #122 SOLICITADO]",
        "Ação: Arme remoto via PoliceCentral",
        `Resultado: ${result}`,
        "Auditoria do comando: #122",
      ].join("\n");
      const summary = getOperatorFacingIncidentNotes(notes);
      expect(summary).toContain("Registro incompleto; consultar histórico");
      expect(summary).not.toContain("Resposta recebida; conferir estado final");
    }
    for (const result of [
      "Não houve resposta recebida.",
      "Falha registrada; não houve resposta recebida.",
      "Cancelado; não houve resposta recebida.",
      "Expirado; não houve resposta recebida.",
      "Aguardando resposta; não houve confirmação recebida.",
    ]) {
      const contradictory = getOperatorFacingIncidentNotes([
        "[COMANDO REMOTO #123 RESPOSTA KA4 RECEBIDA]",
        "Ação: Arme remoto via PoliceCentral",
        `Resultado: ${result}`,
        "Resposta da central: MB=KA4",
        "Auditoria do comando: #123",
      ].join("\n"));
      expect(contradictory).toContain("Resultado incerto; conferir central");
      expect(contradictory).not.toContain("Resposta recebida; conferir estado final");
    }
  });

  it("resume ocorrência remota legada e remove marcador interno sem sufixo", () => {
    const note = buildRemoteCommandOccurrenceText({ commandId: 111, commandType: "disarm", operatorName: "Operador", reason: "Solicitação do cliente", status: "sent" }).observations;
    const summary = getOperatorFacingIncidentNotes(`${note}\n[COMANDO REMOTO #111]\nNota humana posterior.`);
    expect(summary).toContain("Comando: Desarme.");
    expect(summary).toContain("Nota humana posterior.");
    expect(summary).not.toMatch(/#111|COMANDO REMOTO|PoliceCentral|Resultado:|Auditoria do comando/);
  });

  it("remove nota genérica de criação manual e aceita notas ausentes", () => {
    expect(getOperatorFacingIncidentNotes("Ocorrência manual criada pelo operador")).toBe("");
    expect(getOperatorFacingIncidentNotes(null)).toBe("");
    expect(getOperatorFacingIncidentNotes(undefined)).toBe("");
    expect(getOperatorFacingIncidentNotes("")).toBe("");
  });
});
