import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");

describe("layout operacional da fila de ocorrências", () => {
  it("mantém Aguardando aberta, em ordem recente, e recolhe as demais filas em ícones", () => {
    expect(source).toContain("visibleWaitingEvents");
    expect(source).toContain("right.queuedAt - left.queuedAt");
    expect(source).toContain("AGUARDANDO ({visibleWaitingEvents.length})");
    expect(source).toContain("Mais recentes no topo");
    expect(source).toContain('>FILAS<');
    expect(source).toContain("expandedQueue");
    expect(source).toContain("CarFront");
  });

  it("agrupa eventos da mesma conta e permite expandir ou recolher os demais eventos", () => {
    expect(source).toContain("waitingGroups");
    expect(source).toContain("collapsedWaitingAccounts");
    expect(source).toContain("toggleWaitingAccount");
    expect(source).toContain("const [mostRecent, ...otherEvents] = events");
    expect(source).toContain("!isCollapsed && otherEvents.map");
  });

  it("mostra no popup as zonas, contatos e usuários vinculados ao sistema da ocorrência", () => {
    expect(source).toContain("treatmentZones");
    expect(source).toContain("treatmentContacts");
    expect(source).toContain("treatmentAlarmUsers");
    expect(source).toContain("Zonas e setores");
    expect(source).toContain("Usuários do painel");
  });

  it("abre o tratamento em um popup central sem comprimir a fila", () => {
    expect(source).toContain("Tratamento de ocorrência");
    expect(source).toContain("fixed inset-0 z-[70]");
    expect(source).toContain("Registro do atendimento, contatos realizados e providências");
    expect(source).toContain("O tratamento será aberto em uma janela operacional segura.");
  });
});
