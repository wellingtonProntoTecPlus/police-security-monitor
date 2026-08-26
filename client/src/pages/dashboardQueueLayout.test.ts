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
    expect(source).toContain("const visibleGroupEvents = isCollapsed ? [mostRecent] : events");
    expect(source).toContain("visibleGroupEvents.map");
  });

  it("usa toda a largura disponível para cabeçalho e cards da fila Aguardando sem impor largura mínima", () => {
    expect(source).toContain("flex h-full min-w-0 flex-1 flex-col border-r border-border bg-card");
    expect(source).toContain("w-full min-w-0 rounded-lg border border-border/60");
    expect(source).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(source).toContain("xl:grid-cols-2");
  });

  it("mantém o popup de comandos dentro da altura útil em telas menores", () => {
    expect(source).toContain("max-h-[calc(100dvh-1rem)]");
    expect(source).toContain("grid min-h-0 flex-1 gap-4 overflow-y-auto");
  });

  it("mostra no popup as zonas, contatos e usuários vinculados ao sistema da ocorrência", () => {
    expect(source).toContain("treatmentZones");
    expect(source).toContain("treatmentContacts");
    expect(source).toContain("treatmentAlarmUsers");
    expect(source).toContain("Zonas e setores");
    expect(source).toContain("Usuários programados no painel");
  });

  it("abre o tratamento em um popup central sem comprimir a fila", () => {
    expect(source).toContain("Tratamento de ocorrência");
    expect(source).toContain("fixed inset-0 z-[70]");
    expect(source).toContain("Registro do atendimento, contatos realizados e providências");
    expect(source).toContain("O tratamento será aberto em uma janela operacional segura.");
  });
});
