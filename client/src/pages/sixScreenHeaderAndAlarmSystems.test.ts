import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pageSources = {
  partners: readFileSync(new URL("./Partners.tsx", import.meta.url), "utf8"),
  clients: readFileSync(new URL("./Clients.tsx", import.meta.url), "utf8"),
  alarmSystems: readFileSync(new URL("./AlarmSystems.tsx", import.meta.url), "utf8"),
  contactId: readFileSync(new URL("./ContactId.tsx", import.meta.url), "utf8"),
  finalizations: readFileSync(new URL("./Finalizations.tsx", import.meta.url), "utf8"),
  users: readFileSync(new URL("./Users.tsx", import.meta.url), "utf8"),
};

describe("cabeçalho das telas administrativas", () => {
  it("coloca Outras telas no cabeçalho próprio das seis telas solicitadas", () => {
    for (const source of Object.values(pageSources)) {
      expect(source).toContain('workspaceMenuPlacement="page-header"');
      expect(source).toContain('<WorkspaceScreenMenu label="Outras telas" />');
    }
  });

  it("mantém as ações locais separadas do menu", () => {
    expect(pageSources.partners).toContain("Nova Parceira");
    expect(pageSources.clients).toContain("Novo Cliente");
    expect(pageSources.alarmSystems).toContain("Novo Sistema");
    expect(pageSources.contactId).toContain("Novo Evento");
    expect(pageSources.finalizations).toContain("Nova Finalização");
    expect(pageSources.users).toContain("Novo Usuário");
  });
});

describe("tela de Sistemas de Alarme", () => {
  it("busca por cliente e por todos os identificadores técnicos", () => {
    expect(pageSources.alarmSystems).toContain("client?.name");
    expect(pageSources.alarmSystems).toContain("client?.fantasyName");
    for (const field of ["s.account", "s.brand", "s.model", "s.serialNumber", "s.macAddress", "s.imeiGprs", "s.ipAddress", "s.isepId"]) {
      expect(pageSources.alarmSystems).toContain(field);
    }
  });

  it("permite abrir o cliente e editar um sistema cadastrado", () => {
    expect(pageSources.alarmSystems).toContain("trpc.alarmSystem.update.useMutation");
    expect(pageSources.alarmSystems).toContain("openSystemForm(sys)");
    expect(pageSources.alarmSystems).toContain("navigate(`/clients/${sys.clientId}`)");
    expect(pageSources.alarmSystems).toContain("Salvar Alterações");
  });

  it("cadastra um sistema diretamente pela tela e busca somente clientes do parceiro digitado", () => {
    expect(pageSources.alarmSystems).toContain("trpc.alarmSystem.create.useMutation");
    expect(pageSources.alarmSystems).toContain("onClick={() => openSystemForm()}");
    expect(pageSources.alarmSystems).toContain("partnerSearch");
    expect(pageSources.alarmSystems).toContain("matchingPartners");
    expect(pageSources.alarmSystems).toContain("Busca só clientes do parceiro digitado");
    expect(pageSources.alarmSystems).toContain("partnerIdsForClientSearch");
    expect(pageSources.alarmSystems).toContain("client.partnerCompanyId");
    expect(pageSources.alarmSystems).toContain("Digite o nome ou CNPJ do parceiro");
  });
});
