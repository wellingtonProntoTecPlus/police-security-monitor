import { describe, expect, it } from "vitest";
import { validateOperatorHandoffPlan } from "./operatorLogoutContract";

const recipients = new Set([22, 33]);

describe("contrato de logoff com passagem", () => {
  it("permite sair sem pendências sem exigir mensagem", () => {
    expect(validateOperatorHandoffPlan({ openIncidents: [], handoffs: [], allowedRecipientIds: recipients })).toEqual([]);
  });

  it("exige uma anotação e destinatário válido para cada atendimento", () => {
    expect(validateOperatorHandoffPlan({
      openIncidents: [{ incidentId: 10, status: "observing" }, { incidentId: 11, status: "attending" }],
      handoffs: [
        { incidentId: 10, toUserId: 22, message: "Cliente relatou falta de energia no local." },
        { incidentId: 11, toUserId: 33, message: "Tático chamado, aguarda confirmação." },
      ], allowedRecipientIds: recipients,
    })).toHaveLength(2);
  });

  it("não permite omitir/duplicar ocorrências nem usar operador fora da escala validada", () => {
    const openIncidents = [{ incidentId: 10, status: "attending" }, { incidentId: 11, status: "observing" }];
    expect(() => validateOperatorHandoffPlan({ openIncidents, handoffs: [], allowedRecipientIds: recipients })).toThrow("lista de ocorrências mudou");
    expect(() => validateOperatorHandoffPlan({ openIncidents: [openIncidents[0]], handoffs: [
      { incidentId: 10, toUserId: 22, message: "Primeira anotação válida." },
      { incidentId: 10, toUserId: 22, message: "Segunda anotação válida." },
    ], allowedRecipientIds: recipients })).toThrow("duplicados");
    expect(() => validateOperatorHandoffPlan({ openIncidents: [openIncidents[0]], handoffs: [
      { incidentId: 10, toUserId: 99, message: "Anotação para alguém não escalado." },
    ], allowedRecipientIds: recipients })).toThrow("não está na escala");
  });

  it("exige mínimo de caracteres e preserva atendimentos em manutenção para o supervisor", () => {
    expect(() => validateOperatorHandoffPlan({ openIncidents: [{ incidentId: 48, status: "attending" }], handoffs: [
      { incidentId: 48, toUserId: 22, message: "curta" },
    ], allowedRecipientIds: recipients })).toThrow("pelo menos 10 caracteres");
    expect(() => validateOperatorHandoffPlan({ openIncidents: [{ incidentId: 49, status: "maintenance" }], handoffs: [
      { incidentId: 49, toUserId: 22, message: "Aguardando o retorno do cliente." },
    ], allowedRecipientIds: recipients })).toThrow("está em manutenção");
  });
});
