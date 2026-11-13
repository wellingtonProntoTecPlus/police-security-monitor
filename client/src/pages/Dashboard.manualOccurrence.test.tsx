// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";
import { toast } from "sonner";

const manualMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
};

const standardMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
};

const bulkMutation = { mutateAsync: vi.fn(), isPending: false };
const defaultQueue = [{
  id: 701, incidentId: 91, incidentStatus: "waiting", incidentClientId: 4, incidentSystemId: 6,
  account: "0001", brand: "COMPATEC", qualifier: "E", eventCode: "130", description: "Disparo de alarme",
  priority: "critical", receivedAt: new Date("2026-08-12T12:00:00.000Z"),
}];
let mockedPersistedQueue: any[] = defaultQueue;
let mockedBulkPreview: any = { totalCount: 3, eventCount: 3, eligibleCount: 2, eligibleIncidentIds: [91, 92], protectedCount: 1, protectedRows: [] };
const refetchBulkPreview = vi.fn().mockResolvedValue(undefined);
const invalidateOpenQueue = vi.fn().mockResolvedValue(undefined);
const invalidateConnectionStatus = vi.fn().mockResolvedValue(undefined);
const invalidateArmDisarmStatus = vi.fn().mockResolvedValue(undefined);
const invalidateRecentAutoFinalizedArmDisarm = vi.fn().mockResolvedValue(undefined);
let mockedRealtimeEvents: any[] = [];

vi.mock("@/lib/trpc", () => ({
  trpc: {
    occurrence: { create: { useMutation: () => standardMutation } },
    alarmEvent: { createManual: { useMutation: () => manualMutation } },
    incident: {
      assume: { useMutation: () => standardMutation },
      update: { useMutation: () => standardMutation },
      bulkFinalize: { useMutation: () => bulkMutation },
      bulkPreview: { useQuery: () => ({ data: mockedBulkPreview, isFetching: false, error: null, refetch: refetchBulkPreview }) },
      observe: { useMutation: () => standardMutation },
      openQueue: {
        useQuery: () => ({
          data: mockedPersistedQueue,
          isLoading: false,
        }),
      },
    },
    finalization: { list: { useQuery: () => ({ data: [] }) } },
    auth: {
      login: { useMutation: () => standardMutation },
      logout: { useMutation: () => standardMutation },
    },
    monitoredClient: { list: { useQuery: () => ({ data: [
      { id: 5, name: "Cliente incorreto", partnerCompanyId: 8 },
      { id: 4, name: "Cliente de Teste", partnerCompanyId: 8 },
    ] }) } },
    partnerCompany: { list: { useQuery: () => ({ data: [{ id: 8, name: "Parceira de Teste" }] }) } },
    alarmSystem: {
      list: { useQuery: () => ({ data: [
        { id: 7, account: "0001", clientId: 5, brand: "COMPATEC", model: "Outro" },
        { id: 6, account: "0001", clientId: 4, brand: "COMPATEC", model: "X" },
      ] }) },
      remoteCommandCredentialStatus: { useQuery: () => ({ data: { credentials: [] } }) },
      startMaintenance: { useMutation: () => standardMutation },
      endMaintenance: { useMutation: () => standardMutation },
    },
    alarmPgm: { list: { useQuery: () => ({ data: [] }) } },
    remoteCommand: {
      list: { useQuery: () => ({ data: [] }) },
      simulate: { useMutation: () => standardMutation },
      compatecZonePhysical: { useMutation: () => standardMutation },
      compatecZoneSelections: { useQuery: () => ({ data: [] }) },
      selectCompatecZoneForArm: { useMutation: () => standardMutation },
      queryBenchStatus: { useMutation: () => standardMutation },
      queryVettiBenchStatus: { useMutation: () => standardMutation },
      disarmVettiBench: { useMutation: () => standardMutation },
      queryBenchSectors: { useMutation: () => standardMutation },
      disarmBenchAll: { useMutation: () => standardMutation },
    },
    clientContact: { list: { useQuery: () => ({ data: [] }) } },
    clientProcedure: { list: { useQuery: () => ({ data: [] }) } },
    alarmZone: { list: { useQuery: () => ({ data: [] }) } },
    alarmUser: {
      list: { useQuery: () => ({ data: [] }) },
      operationalList: { useQuery: () => ({ data: [] }) },
    },
    dashboard: {
      armDisarmStatus: { useQuery: () => ({ data: { armed: [], disarmed: [] } }) },
      recentAutoFinalizedArmDisarm: { useQuery: () => ({ data: [{ account: "0336", brand: "VETTI", stateLabel: "ARMADO", description: "Arme", eventCode: "401", receivedAt: new Date("2026-08-13T13:08:00.000Z") }] }) },
      scheduleAlerts: { useQuery: () => ({ data: [] }) },
      acknowledgeScheduleAlert: { useMutation: () => standardMutation },
      connectionStatus: { useQuery: () => ({ data: [] }) },
    },
    camera: { list: { useQuery: () => ({ data: [] }) } },
    useUtils: () => ({
      incident: { openQueue: { invalidate: invalidateOpenQueue }, history: { invalidate: vi.fn().mockResolvedValue(undefined) } },
      occurrence: { list: { invalidate: vi.fn().mockResolvedValue(undefined) } },
      alarmSystem: { list: { invalidate: vi.fn().mockResolvedValue(undefined) } },
      remoteCommand: { list: { invalidate: vi.fn().mockResolvedValue(undefined) }, compatecZoneSelections: { invalidate: vi.fn().mockResolvedValue(undefined), fetch: vi.fn().mockResolvedValue([]) } },
      dashboard: {
        connectionStatus: { invalidate: invalidateConnectionStatus },
        armDisarmStatus: { invalidate: invalidateArmDisarmStatus },
        recentAutoFinalizedArmDisarm: { invalidate: invalidateRecentAutoFinalizedArmDisarm },
        scheduleAlerts: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
    }),
  },
}));

vi.mock("@/hooks/useSocket", () => ({
  useSocket: () => ({ connected: true, realtimeEvents: mockedRealtimeEvents }),
}));

vi.mock("@/components/HLSPlayer", () => ({
  default: () => <div data-testid="hls-player" />,
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/sonner", () => ({}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Wellington", email: "wellingtonportes@gmail.com", role: "admin" },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

describe("Dashboard — Ocorrência Manual", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    manualMutation.mutate.mockReset();
    manualMutation.mutateAsync.mockReset();
    standardMutation.mutate.mockReset();
    standardMutation.mutateAsync.mockReset();
    invalidateOpenQueue.mockClear();
    invalidateConnectionStatus.mockClear();
    invalidateArmDisarmStatus.mockClear();
    invalidateRecentAutoFinalizedArmDisarm.mockClear();
    mockedRealtimeEvents = [];
    mockedPersistedQueue = defaultQueue;
    bulkMutation.mutateAsync.mockReset();
    mockedBulkPreview = { totalCount: 3, eventCount: 3, eligibleCount: 2, eligibleIncidentIds: [91, 92], protectedCount: 1, protectedRows: [] };
    refetchBulkPreview.mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.warning).mockClear();
    vi.mocked(toast.info).mockClear();
    standardMutation.mutateAsync.mockResolvedValue({ success: true });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        state = "running";
        resume = vi.fn();
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("abre o formulário manual sem entrar em ciclo de renderização", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: /ocorrência manual/i }));

    expect(screen.getByRole("heading", { name: "Nova Ocorrência Manual" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Deixe em branco para a Conta do Sistema (0000)")).toBeTruthy();
    expect(screen.getByPlaceholderText("Descreva a ocorrência manual...")).toBeTruthy();
  });

  it("atualiza os indicadores imediatamente ao receber Keep Alive ou confirmação automática", async () => {
    mockedRealtimeEvents = [
      { kind: "keepalive", alarmSystemId: 55, account: "0029", brand: "JFL", timestamp: "2026-09-05T23:30:00.000Z" },
      { kind: "arm_disarm_confirmation", alarmSystemId: 55, account: "0029", brand: "JFL", qualifier: "R", eventCode: "403", timestamp: "2026-09-05T23:30:01.000Z" },
    ];

    render(<Dashboard />);

    await waitFor(() => {
      expect(invalidateConnectionStatus).toHaveBeenCalledTimes(1);
      expect(invalidateArmDisarmStatus).toHaveBeenCalledTimes(1);
      expect(invalidateRecentAutoFinalizedArmDisarm).toHaveBeenCalledTimes(1);
    });
  });

  it("apresenta KA1 como informação de recebimento de zona, sem confirmar bypass nem atualizar estado armado", async () => {
    mockedRealtimeEvents = [{ kind: "remote_command_ack", alarmSystemId: 6, commandId: 88, commandType: "isolate_zone", actionLabel: "Inibição de Zona", timestamp: "2026-11-12T19:00:00Z" }];
    render(<Dashboard />);
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(
      "Inibição de Zona: resposta MB=KA1 recebida. Isso indica recebimento, não confirma o estado final do bypass.",
      { duration: 12_000 },
    ));
    expect(invalidateArmDisarmStatus).not.toHaveBeenCalled();
    expect(invalidateOpenQueue).not.toHaveBeenCalled();
    expect(screen.getAllByText("Disparo de alarme")).toHaveLength(1);
  });

  it("apresenta KA4 como resposta ao quadro, sem confirmar o Arme nem invalidar status final", async () => {
    mockedRealtimeEvents = [{ kind: "remote_command_ack", alarmSystemId: 6, commandId: 90, commandType: "arm", actionLabel: "Arme Compatec", responsePayload: "MB=KA4", timestamp: "2026-11-12T19:00:00Z" }];
    render(<Dashboard />);
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(
      "Arme Compatec: resposta MB=KA4 recebida. A resposta não confirma o estado final; confira o evento/status real do painel.",
      { duration: 12_000 },
    ));
    expect(invalidateArmDisarmStatus).not.toHaveBeenCalled();
  });

  it("pede a senha em confirmação nativa ao desativar o áudio, sem montar um modal React", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValueOnce("SenhaConfirmada123").mockReturnValueOnce("Troca de turno");
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Áudio ativo" }));

    expect(promptSpy).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(standardMutation.mutateAsync).toHaveBeenCalledWith({
        email: "wellingtonportes@gmail.com",
        password: "SenhaConfirmada123",
      });
    });
  });

  it("abre o calendário de manutenção para o sistema da ocorrência selecionada", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByText("Disparo de alarme"));
    await user.click(screen.getByRole("button", { name: "Manutenção" }));

    expect(screen.getByRole("heading", { name: "Programar Manutenção do Sistema" })).toBeTruthy();
    expect(screen.getAllByLabelText(/início|fim/i)).toHaveLength(2);
  });

  it("mantém no card e no modal o cliente apontado pelos IDs persistidos quando a conta é repetida", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    expect((await screen.findAllByText("Cliente de Teste")).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Cliente incorreto")).toBeNull();

    await user.click(screen.getByText("Disparo de alarme"));

    expect(screen.getByText("Tratamento de ocorrência")).toBeTruthy();
    expect(screen.getByText("Cliente de Teste")).toBeTruthy();
    expect(screen.queryByText("Cliente incorreto")).toBeNull();
  });

  it("abre o atendimento recebido pelo link da mensagem persistente", async () => {
    window.history.replaceState({}, "", "/dashboard?incidentId=91");
    render(<Dashboard />);

    expect(await screen.findByText("Tratamento de ocorrência")).toBeTruthy();
  });

  it("exibe a data ao lado do horário recebido no cartão da fila", () => {
    render(<Dashboard />);

    const receivedAt = new Date(defaultQueue[0].receivedAt);
    const time = receivedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const date = receivedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeLabel = screen.getByText(time);

    expect(timeLabel.parentElement?.textContent).toContain(date);
  });

  it("exibe a confirmação de Arme ou Desarme recebida e finalizada automaticamente", () => {
    render(<Dashboard />);

    expect(screen.getByText("Última confirmação automática")).toBeTruthy();
    expect(screen.getByText(/ARMADO · Conta 0336 · VETTI · Arme/)).toBeTruthy();
  });

  it.each([
    { count: 2, closedIncidentIds: [91, 92], skippedCount: 1, feedback: "warning" },
    { count: 0, closedIncidentIds: [], skippedCount: 3, feedback: "info" },
  ])("finalização em massa informa $feedback e não anuncia sucesso falso", async result => {
    mockedPersistedQueue = [
      { ...defaultQueue[0], incidentOperatorId: 1, incidentStatus: "attending" },
      { ...defaultQueue[0], id: 702, incidentId: 92, eventCode: "KOFF", description: "KOFF automático sem operador", incidentStatus: "observing", incidentOperatorId: null },
      { ...defaultQueue[0], id: 703, incidentId: 93, description: "Registro protegido", incidentOperatorId: 8 },
      { ...defaultQueue[0], id: 704, incidentId: 94, description: "Outra central da mesma conta", incidentSystemId: 7 },
    ];
    bulkMutation.mutateAsync.mockResolvedValue(result);
    const user = userEvent.setup();
    render(<Dashboard />);
    // Fila Em atendimento contém o registro próprio; abrir o agrupamento desta fila.
    await user.click(screen.getByTitle("Atendimento (1)"));
    await user.click(await screen.findByText("Disparo de alarme"));
    await user.type(screen.getByPlaceholderText("Registro do atendimento, contatos realizados e providências..."), "Comunicação conferida. Fechar lote.");
    await user.click(screen.getByRole("button", { name: "Finalizar em massa" }));
    expect(screen.getByText(/1 registro\(s\) de outro operador ou em manutenção/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar finalização" }));
    await waitFor(() => expect(bulkMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ account: "0001", alarmSystemId: 6 })));
    if (result.count === 0) {
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("não corresponde ao lote confirmado")));
      expect(refetchBulkPreview).toHaveBeenCalled();
    } else await waitFor(() => expect(toast[result.feedback as "warning" | "info"]).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText("Outra central da mesma conta")).not.toBeNull();
    if (result.count === 0) expect(screen.getByText("Tratamento de ocorrência")).toBeTruthy();
    else expect(screen.queryByText("Tratamento de ocorrência")).toBeNull();
  });

  it("mostra 25 atendimentos mas confirma apenas 1 elegível, explicando os 24 protegidos antes de finalizar", async () => {
    mockedPersistedQueue = [
      { ...defaultQueue[0], incidentOperatorId: 1, incidentStatus: "attending", parentIncidentId: 90 },
      ...Array.from({ length: 24 }, (_, index) => ({ ...defaultQueue[0], id: 702 + index, incidentId: 92 + index, description: `Observação protegida ${index}`, incidentStatus: "observing", incidentOperatorId: 8 })),
    ];
    mockedBulkPreview = { totalCount: 25, eventCount: 24, eligibleCount: 1, eligibleIncidentIds: [91], protectedCount: 24, protectedRows: [{ incidentId: 92, reason: "Pertence a outro operador" }] };
    bulkMutation.mutateAsync.mockResolvedValue({ count: 1, closedIncidentIds: [91], skippedCount: 24 });
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByTitle("Atendimento (1)"));
    await user.click(await screen.findByText("Disparo de alarme"));
    await user.type(screen.getByPlaceholderText("Registro do atendimento, contatos realizados e providências..."), "Encerrar somente o lote conferido.");
    await user.click(screen.getByRole("button", { name: "Finalizar em massa" }));
    expect(screen.getByText(/São 24 eventos recebidos e 25 atendimentos/)).toBeTruthy();
    expect(screen.getByText(/24 registro\(s\) de outro operador ou em manutenção/)).toBeTruthy();
    expect(screen.getByText("1 atendimento")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar finalização" }));
    await waitFor(() => expect(bulkMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ confirmedIncidentIds: [91] })));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("24 registro(s) protegido(s)")));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("distingue os controles Vetti simulados dos controles físicos controlados da bancada", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Dashboard.tsx"), "utf8");

    expect(source).toContain("Comando remoto Vetti VSec · simulações e controle físico de bancada");
    expect(source).toContain("Simulados: Arme, Zona e PGM. Físicos controlados: consulta 0x14 e Desarme 0x43");
    expect(source).not.toContain('"Vetti VSec" : "Compatec"} · modo de simulação');
  });

  it("mantém um único controle de estado e apresenta o resumo da ação remota no atendimento", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Dashboard.tsx"), "utf8");

    expect(source).toContain('selectedArmDisarmState === "armed"');
    expect(source).toContain(">DESARMAR</Button>");
    expect(source).toContain(">ARMAR</Button>");
    expect(source).toContain("Arme remoto ainda não homologado.");
    expect(source).toContain("Ação remota confirmada");
    expect(source).toContain("[COMANDO REMOTO CONFIRMADO]");
  });
});
