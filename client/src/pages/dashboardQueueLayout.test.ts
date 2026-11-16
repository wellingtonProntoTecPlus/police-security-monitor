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

  it("abre o tratamento no espaço central das filas e mantém os logs fixos à direita", () => {
    expect(source).toContain("Tratamento de ocorrência");
    expect(source).toContain('data-testid="active-occurrence-inline"');
    expect(source).toContain("{selectedEvent ? occurrenceTreatmentPanel : <div className=");
    expect(source).toContain('<aside aria-label="Logs da Ocorrência"');
    expect(source).not.toContain('fixed inset-0 z-[70] flex items-end justify-center bg-black/65');
    expect(source).toContain("Registro do atendimento, contatos realizados e providências");
    expect(source).toContain("{selectedEvent ? occurrenceTreatmentPanel");
    expect(source).toContain('<div className="flex min-h-0 flex-1 overflow-hidden max-lg:flex-col">');
    expect(source).toContain('aria-label="Área central de atendimento" className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden max-lg:h-auto"');
    expect(source).toContain("max-lg:h-[min(34dvh,280px)]");
    expect(source).toMatch(/<div className="flex min-h-0 flex-1 overflow-hidden max-lg:flex-col">[\s\S]*?<main aria-label="Área central de atendimento"[\s\S]*?<aside aria-label="Logs da Ocorrência"/);
  });

  it("não permite que o popup periódico de pendentes cubra o rascunho do atendimento", () => {
    expect(source).toContain("if (selectedEvent) return;");
    expect(source).toContain("if (selectedEvent && pendingPopup) closePendingPopup();");
  });

  it("reconcilia a fila persistida ao retornar de uma aba ou tablet em segundo plano", () => {
    expect(source).toContain("reconcileDashboardData");
    expect(source).toContain("wasDashboardBackgroundedRef");
    expect(source).toContain('document.addEventListener("visibilitychange", reconcileOnVisibilityChange)');
    expect(source).toContain("utils.incident.openQueue.invalidate()");
    expect(source).toContain("return refreshed ? { ...previous, ...refreshed } : null");
  });

  it("mostra o responsável e permite assumir a mesma ocorrência em observação", () => {
    expect(source).toContain("incidentOperatorName");
    expect(source).toContain("Responsável pelo atendimento:");
    expect(source).toContain("isOtherOperatorObservation");
    expect(source).toContain("Assumir atendimento");
    expect(source).not.toContain("Será criado um segundo registro vinculado a esta ocorrência");
    expect(source).toContain('openPanelMut.mutateAsync({ incidentId: ev.incidentId, leaseToken, ...(assume ? { assume: true } : {}) })');
    expect(source).toContain("Atendimento assumido; o status da fila foi preservado.");
    expect(source).toContain("Status e motivo serão preservados ao abrir/assumir o painel");
    expect(source).toContain("incidentStatusToQueueStatus(opened.status)");
    expect(source).toContain("utils.incident.openQueue.invalidate()");
    expect(source).toContain("isOtherOperatorAttendance");
    expect(source).toContain("Modo consulta: nenhum controle operacional será enviado.");
    expect(source).toContain("Você pode consultar contatos, notas e logs");
    expect(source).toContain("Registro anterior e transferência do atendimento");
  });

  it("mantém lease em memória, renova periodicamente e bloqueia ações ao perder a renovação", () => {
    expect(source).toContain("Lease de painel vive somente em memória");
    expect(source).toContain('window.setInterval(async () => {');
    expect(source).toContain("}, 15_000)");
    expect(source).toContain("renewPanelCallRef.current({ incidentId, leaseToken: lease.leaseToken })");
    expect(source).toContain("setLeaseBlocked(true)");
    expect(source).toContain("!lease || lease.incidentId !== incidentId || renewing || stopped");
  });

  it("exige motivo para pausa, observação, Tático e manutenção e não permite sair com ACK pendente", () => {
    expect(source).toContain("Motivo da pausa (obrigatório, mínimo de 5 caracteres)");
    expect(source).toContain("Informe o motivo obrigatório da observação (mínimo de 5 caracteres).");
    expect(source).toContain("Informe o motivo obrigatório para encaminhar ao Tático (mínimo de 5 caracteres).");
    expect(source).toContain("Informe o motivo obrigatório da manutenção (mínimo de 5 caracteres).");
    expect(source).toContain("Conclua ou tente gravar a auditoria pendente antes de pausar o atendimento.");
    expect(source).toContain("panelTransitionInFlightRef.current");
    expect(source).toContain("Aguarde a confirmação da finalização desta ocorrência antes de sair.");
  });

  it("anexa lease token às ações e finalizações e nunca o persiste no outbox de auditoria", () => {
    expect(source).toContain("const payload = { ...input, incidentId, requestId, leaseToken: lease.leaseToken }");
    expect(source).toContain("delete payload.leaseToken");
    expect(source).toContain("await recordAuditActionMut.mutateAsync({ ...failedAuditAction, leaseToken: lease.leaseToken })");
    expect(source).toContain("leaseToken: lease.leaseToken,");
    expect(source).toContain("Abra ou assuma o painel exclusivo antes de finalizar esta ocorrência.");
    expect(source).toContain("Abra ou assuma o painel exclusivo antes de finalizar em massa.");
  });

  it("permite abrir outra tela sem fechar o atendimento atual", () => {
    expect(source).toContain("WorkspaceScreenMenu");
    expect(source).toContain("Abrir outra tela sem fechar este atendimento");
  });
});
