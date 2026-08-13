import { describe, expect, it } from "vitest";
import {
  prepareAlarmSystemCreatePayload,
  prepareClientProcedurePayload,
  prepareFinalizationPayload,
  prepareSystemUserCreatePayload,
} from "./registrationCrudPayloads";

describe("payloads reais dos CRUDs com padronização", () => {
  it("prepara o sistema sem modificar seus identificadores técnicos", () => {
    expect(prepareAlarmSystemCreatePayload({
      model: "central principal", account: "03-36", macAddress: "c1-bd-cb", imeiGprs: "12 34 56", isepId: "69-3e", firmwareVersion: "V4.0",
    })).toEqual({
      model: "Central Principal", account: "0336", macAddress: "C1BDCB", imeiGprs: "123456", isepId: "693E", firmwareVersion: "V4.0",
    });
  });

  it("prepara usuários, finalizações e procedimentos antes da persistência", () => {
    expect(prepareSystemUserCreatePayload({ name: "WELLINGTON PORTES", email: "well@example.com" })).toEqual({ name: "Wellington Portes", email: "well@example.com" });
    expect(prepareFinalizationPayload({ title: "contato realizado", description: "MANTER A DESCRIÇÃO" })).toEqual({ title: "Contato Realizado", description: "MANTER A DESCRIÇÃO" });
    expect(prepareClientProcedurePayload({ title: "avisar o responsável", description: "MANTER A ORIENTAÇÃO" })).toEqual({ title: "Avisar o Responsável", description: "MANTER A ORIENTAÇÃO" });
  });
});
