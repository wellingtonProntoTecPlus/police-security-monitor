// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
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
const auditMutation = { mutateAsync: vi.fn(), isPending: false };
const invalidateAuditTrail = vi.fn().mockResolvedValue(undefined);
let mockedAuditItems: any[] = [];
let mockedCameras: any[] = [];
let mockedContacts: any[] = [];
const defaultQueue = [{
  id: 701, incidentId: 91, incidentStatus: "waiting", incidentClientId: 4, incidentSystemId: 6,
  account: "0001", brand: "COMPATEC", qualifier: "E", eventCode: "130", description: "Disparo de alarme",
  priority: "critical", receivedAt: new Date("2026-08-12T12:00:00.000Z"),
}];
let mockedPersistedQueue: any[] = defaultQueue;
let mockedBulkPreview: any = { totalCount: 3, eventCount: 3, eligibleCount: 2, eligibleIncidentIds: [91, 92], protectedCount: 1, protectedRows: [] };
let mockedClientData: any[] = [
  { id: 5, name: "Cliente incorreto", partnerCompanyId: 8 },
  { id: 4, name: "Cliente de Teste", partnerCompanyId: 8 },
];
let mockedPartnerCompanyData: any[] = [{ id: 8, name: "Parceira de Teste" }];
let mockedArmDisarmStatus: { armed: any[]; disarmed: any[] } = { armed: [], disarmed: [] };
let mockedRecentClientEvents: any = { incidentEventId: 701, events: [{ id: 701, alarmSystemId: 6, account: "0001", brand: "COMPATEC", systemModel: "X", qualifier: "E", eventCode: "130", partition: "00", zoneUser: "002", description: "Disparo de alarme", priority: "critical", receivedAt: new Date("2026-08-12T12:00:00.000Z") }] };
const queryRecentClientEvents = vi.fn();
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
      recentClientEvents: { useQuery: (input: any) => { queryRecentClientEvents(input); return { data: mockedRecentClientEvents, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }; } },
      auditTrail: { useQuery: () => ({ data: { items: mockedAuditItems, nextCursor: null }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }) },
      recordAction: { useMutation: () => auditMutation },
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
    monitoredClient: { list: { useQuery: () => ({ data: mockedClientData }) } },
    partnerCompany: { list: { useQuery: () => ({ data: mockedPartnerCompanyData }) } },
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
    clientContact: { list: { useQuery: () => ({ data: mockedContacts }) } },
    clientProcedure: { list: { useQuery: () => ({ data: [] }) }, treatment: { useQuery: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }) } },
    alarmZone: { list: { useQuery: () => ({ data: [] }) } },
    alarmUser: {
      list: { useQuery: () => ({ data: [] }) },
      operationalList: { useQuery: () => ({ data: [] }) },
    },
    dashboard: {
      armDisarmStatus: { useQuery: () => ({ data: mockedArmDisarmStatus }) },
      recentAutoFinalizedArmDisarm: { useQuery: () => ({ data: [{ account: "0336", brand: "VETTI", stateLabel: "ARMADO", description: "Arme", eventCode: "401", receivedAt: new Date("2026-08-13T13:08:00.000Z") }] }) },
      scheduleAlerts: { useQuery: () => ({ data: [] }) },
      acknowledgeScheduleAlert: { useMutation: () => standardMutation },
      connectionStatus: { useQuery: () => ({ data: [] }) },
    },
    camera: { list: { useQuery: () => ({ data: mockedCameras }) } },
    useUtils: () => ({
      incident: { openQueue: { invalidate: invalidateOpenQueue }, history: { invalidate: vi.fn().mockResolvedValue(undefined) }, auditTrail: { invalidate: invalidateAuditTrail } },
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
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    if (typeof globalThis.ResizeObserver === "undefined") vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    localStorage.clear();
    mockedAuditItems = [];
    mockedCameras = [];
    mockedContacts = [];
    auditMutation.mutateAsync.mockReset().mockResolvedValue({ id: 1001 });
    invalidateAuditTrail.mockClear();
    manualMutation.mutate.mockReset();
    manualMutation.mutateAsync.mockReset();
    standardMutation.mutate.mockReset();
    standardMutation.mutateAsync.mockReset();
    invalidateOpenQueue.mockClear();
    invalidateConnectionStatus.mockClear();
    invalidateArmDisarmStatus.mockClear();
    invalidateRecentAutoFinalizedArmDisarm.mockClear();
    mockedRealtimeEvents = [];
    queryRecentClientEvents.mockClear();
    mockedRecentClientEvents = { incidentEventId: 701, events: [{ id: 701, alarmSystemId: 6, account: "0001", brand: "COMPATEC", systemModel: "X", qualifier: "E", eventCode: "130", partition: "00", zoneUser: "002", description: "Disparo de alarme", priority: "critical", receivedAt: new Date("2026-08-12T12:00:00.000Z") }] };
    mockedPersistedQueue = defaultQueue;
    mockedClientData = [
      { id: 5, name: "Cliente incorreto", partnerCompanyId: 8 },
      { id: 4, name: "Cliente de Teste", partnerCompanyId: 8 },
    ];
    mockedPartnerCompanyData = [{ id: 8, name: "Parceira de Teste" }];
    mockedArmDisarmStatus = { armed: [], disarmed: [] };
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

  it("mostra ‘Falha de Keep Alive restaurada’ e remove o KOFF da fila ao chegar evento real", async () => {
    mockedPersistedQueue = [{
      id: 611,
      incidentId: 91,
      incidentStatus: "observing",
      incidentClientId: 4,
      incidentSystemId: 6,
      account: "0041",
      brand: "RADIOENGE",
      qualifier: "E",
      eventCode: "KOFF",
      description: "Falha de Keep Alive",
      priority: "high",
      receivedAt: new Date("2026-11-14T10:00:00.000Z"),
    }];
    mockedRealtimeEvents = [{
      id: 612,
      kind: "restoration_closed",
      originalEventId: 611,
      incidentId: 91,
      account: "0041",
      brand: "RADIOENGE",
      qualifier: "E",
      eventCode: "130",
      description: "Falha de Keep Alive restaurada",
      restorationDescription: "Falha de Keep Alive restaurada ao receber o evento real E130 da central em 14/11/2026, 07:00:00.",
      timestamp: "2026-11-14T10:00:00.000Z",
    }];

    render(<Dashboard />);

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      "Falha de Keep Alive restaurada ao receber o evento real E130 da central em 14/11/2026, 07:00:00.",
    ));
    expect(screen.queryByText("Falha de Keep Alive")).toBeNull();
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

  it("abre o tratamento na área central, mantém os logs visíveis à direita e preserva o cliente correto", async () => {
    mockedAuditItems = [{ id: 9001, incidentId: 91, operatorName: "Amanda", action: "police_action_registered", note: "Acionamento acompanhado", createdAt: new Date("2026-11-14T20:00:00Z") }];
    const user = userEvent.setup();
    render(<Dashboard />);

    expect((await screen.findAllByText("Cliente de Teste")).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Cliente incorreto")).toBeNull();

    await user.click(screen.getByText("Disparo de alarme"));

    expect(screen.getByTestId("active-occurrence-inline")).toBeTruthy();
    expect(screen.queryByText("AGUARDANDO (0)")).toBeNull();
    const auditSidebar = screen.getByRole("complementary", { name: "Logs da Ocorrência" });
    expect(within(auditSidebar).getByText("Amanda · Registrou acionamento manual da Polícia")).toBeTruthy();
    expect(within(auditSidebar).getByText("Acionamento acompanhado")).toBeTruthy();
    expect(screen.getByText("Tratamento de ocorrência")).toBeTruthy();
    expect(screen.getByText("Cliente de Teste")).toBeTruthy();
    expect(screen.queryByText("Cliente incorreto")).toBeNull();
  });

  it("abre eventos recentes da ocorrência em consulta somente leitura vinculada ao incidentId", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByText("Disparo de alarme"));
    await user.click(screen.getByRole("button", { name: "Consultar últimos eventos do cliente" }));
    expect(screen.getByRole("heading", { name: "Últimos eventos do cliente" })).toBeTruthy();
    expect(screen.getByText("Origem desta ocorrência")).toBeTruthy();
    expect(queryRecentClientEvents).toHaveBeenCalledWith({ incidentId: 91 });
  });

  it("volta às filas ao fechar o painel sem finalizar e mantém a última auditoria", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByText("Disparo de alarme"));
    expect(screen.getByTestId("active-occurrence-inline").closest("main")?.getAttribute("aria-label")).toBe("Área central de atendimento");
    expect(screen.getByRole("complementary", { name: "Logs da Ocorrência" }).closest("main")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Fechar tratamento" }));
    expect(screen.queryByTestId("active-occurrence-inline")).toBeNull();
    expect(screen.getByText("AGUARDANDO (0)")).toBeTruthy();
    expect(screen.getByText(/Ocorrência #91/)).toBeTruthy();
    expect(standardMutation.mutate).not.toHaveBeenCalled();
  });

  it("retoma para atendimento uma ocorrência em observação atribuída ao próprio operador", async () => {
    mockedPersistedQueue = [{ ...defaultQueue[0], incidentStatus: "observing", incidentOperatorId: 1, incidentOperatorName: "Wellington" }];
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByTitle("Observação (1)"));
    await user.click(await screen.findByText("Disparo de alarme"));
    await waitFor(() => expect(standardMutation.mutateAsync).toHaveBeenCalledWith({ id: 91, status: "attending" }));
    expect(screen.getByTestId("active-occurrence-inline")).toBeTruthy();
    expect(screen.getByText("Responsável pelo atendimento:")).toBeTruthy();
  });

  it("preserva o atendimento aberto enquanto a finalização aguarda confirmação do servidor", async () => {
    mockedPersistedQueue = [
      { ...defaultQueue[0], incidentStatus: "attending", incidentOperatorId: 1 },
      { ...defaultQueue[0], id: 702, incidentId: 92, incidentStatus: "attending", incidentOperatorId: 1, description: "Outra ocorrência em andamento" },
    ];
    let finalizeOptions: any;
    standardMutation.mutate.mockImplementation((_payload: any, options: any) => { finalizeOptions = options; });
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByTitle("Atendimento (2)"));
    await user.click(await screen.findByText("Disparo de alarme"));
    await user.type(screen.getByPlaceholderText("Registro do atendimento, contatos realizados e providências..."), "Atendimento encerrado após verificação.");
    await user.click(screen.getByRole("button", { name: "Finalizar" }));
    expect(standardMutation.mutate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Finalizar" }));
    expect(standardMutation.mutate).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("A finalização já foi enviada"));
    const confirm = vi.spyOn(window, "confirm");
    await user.click(screen.getByRole("button", { name: "Fechar tratamento" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("Aguarde a confirmação da finalização"));
    expect(screen.getByTestId("active-occurrence-inline")).toBeTruthy();
    expect(screen.getByText("Conta 0001")).toBeTruthy();
    finalizeOptions.onError(new Error("Falha controlada no teste"));
    finalizeOptions.onSettled();
  });

  it("finaliza só a ocorrência aberta e volta às filas mantendo outra central com mesma conta e hora", async () => {
    mockedPersistedQueue = [defaultQueue[0], { ...defaultQueue[0], id: 702, incidentId: 92, incidentSystemId: 7, description: "Outra central preservada" }];
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByText("Disparo de alarme"));
    await user.type(screen.getByPlaceholderText("Registro do atendimento, contatos realizados e providências..."), "Verificação concluída sem anormalidades.");
    await user.click(screen.getByRole("button", { name: /^Finalizar$/ }));
    expect(standardMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 91 }), expect.any(Object));
    const options = standardMutation.mutate.mock.calls[0][1];
    options.onSuccess();
    await waitFor(() => expect(screen.queryByTestId("active-occurrence-inline")).toBeNull());
    expect(screen.getByText("Outra central preservada")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Logs da Ocorrência" })).toBeTruthy();
  });

  it("renderiza uma prévia segura do atendimento inline com dados fictícios para revisão", async () => {
    mockedContacts = [{ id: 301, clientId: 4, alarmSystemId: 6, name: "Responsável do cliente" }];
    mockedAuditItems = [
      { id: 9003, incidentId: 91, operatorName: "Wellington", action: "observing", note: "Responsável informou falta de energia. Previsão de retorno às 23h.", createdAt: new Date("2026-11-14T22:34:00Z") },
      { id: 9002, incidentId: 91, operatorName: "Wellington", action: "contact_selected", note: "Selecionou contato Responsável do cliente.", createdAt: new Date("2026-11-14T22:32:00Z") },
      { id: 9001, incidentId: 91, operatorName: "Wellington", action: "claimed", note: "Atendimento assumido pelo operador.", createdAt: new Date("2026-11-14T22:30:00Z") },
    ];
    const view = render(<Dashboard />);
    await userEvent.click(await screen.findByText("Disparo de alarme"));
    expect(screen.getAllByRole("region", { name: "Logs persistidos da ocorrência" })).toHaveLength(1);
    if (process.env.POLICE_INLINE_VISUAL_HTML) {
      const assets = resolve(process.cwd(), "dist/public/assets");
      const css = readFileSync(resolve(assets, readdirSync(assets).find((file) => file.endsWith(".css"))!), "utf8");
      writeFileSync(process.env.POLICE_INLINE_VISUAL_HTML, `<!doctype html><html lang="pt-BR" class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia de teste — atendimento dentro da fila</title><style>${css}</style><style>html,body{width:100%;height:100%;margin:0} #preview-app{height:calc(100dvh - 40px);overflow:hidden} #preview-label{height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid #253848;color:#a9eafa;font:12px sans-serif} [data-radix-scroll-area-viewport]{height:100%;overflow:auto!important}</style></head><body><header id="preview-label"><span>POLICE CENTRAL · Prévia de teste — dados fictícios</span><span>Atendimento na área central · Logs fixos à direita</span></header><div id="preview-app">${view.container.innerHTML}</div></body></html>\n`);
    }
  });

  it("registra abertura de câmera com ocorrência correta, sem enviar nome/hora/credencial do navegador", async () => {
    mockedCameras = [{ id: 201, clientId: 4, name: "Entrada", isActive: true, rtspUrl: "" }];
    mockedContacts = [{ id: 301, clientId: 4, alarmSystemId: 6, name: "Sr Fausto" }];
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByText("Disparo de alarme"));
    await user.click(screen.getByRole("button", { name: /^Câmeras$/ }));
    await user.click(screen.getByRole("button", { name: "Abrir Câmera 1 — Entrada" }));
    await waitFor(() => expect(auditMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 91, action: "camera_viewed", targetId: 201, requestId: expect.any(String) })));
    const cameraPayload = auditMutation.mutateAsync.mock.calls[0][0];
    expect(cameraPayload.operatorName).toBeUndefined();
    expect(cameraPayload.createdAt).toBeUndefined();
    expect(cameraPayload.rtspUrl).toBeUndefined();
    expect(localStorage.getItem("police-incident-audit-pending-1")).toBeNull();
  });

  it("seleciona contato e só abre o destino WhatsApp após confirmar o registro, impedindo clique concorrente", async () => {
    mockedContacts = [{ id: 301, clientId: 4, alarmSystemId: 6, name: "Sr Fausto", phone: "11999999999" }];
    const externalWindow = { opener: {}, location: { href: "about:blank" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(externalWindow as any);
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByText("Disparo de alarme"));
    await user.click(screen.getByRole("button", { name: "Contatos (1)" }));
    await user.click(screen.getByRole("button", { name: "Selecionar contato" }));
    await waitFor(() => expect(auditMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 91, targetId: 301, action: "contact_selected" })));
    let confirm!: (value: any) => void;
    auditMutation.mutateAsync.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(externalWindow.location.href).toBe("about:blank");
    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(open).toHaveBeenCalledTimes(1);
    confirm({ id: 1002 });
    await waitFor(() => expect(externalWindow.location.href).toBe("https://wa.me/5511999999999"));
    expect(externalWindow.opener).toBeNull();
    open.mockRestore();
  });

  it("não abre WhatsApp externo se a auditoria falhar", async () => {
    mockedContacts = [{ id: 301, clientId: 4, alarmSystemId: 6, name: "Sr Fausto", phone: "11999999999" }];
    const externalWindow = { opener: {}, location: { href: "about:blank" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(externalWindow as any);
    auditMutation.mutateAsync.mockRejectedValueOnce(new Error("Rede indisponível"));
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByText("Disparo de alarme"));
    await user.click(screen.getByRole("button", { name: "Contatos (1)" }));
    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    await waitFor(() => expect(externalWindow.close).toHaveBeenCalledTimes(1));
    expect(externalWindow.location.href).toBe("about:blank");
    expect(screen.getByRole("button", { name: "Ligar" })).toHaveProperty("disabled", true);
    open.mockRestore();
  });

  it("não perde pedido de auditoria sem resposta e repete com a mesma chave ao tentar novamente", async () => {
    auditMutation.mutateAsync.mockRejectedValueOnce(new Error("Falha de rede")).mockResolvedValueOnce({ id: 1001 });
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByText("Disparo de alarme"));
    await user.click(screen.getByRole("button", { name: /^Polícia$/ }));
    await waitFor(() => expect(auditMutation.mutateAsync).toHaveBeenCalledTimes(1));
    const originalPayload = auditMutation.mutateAsync.mock.calls[0][0];
    expect(JSON.parse(localStorage.getItem("police-incident-audit-pending-1")!)).toEqual(originalPayload);
    await user.click(screen.getAllByRole("button", { name: "Tentar gravar novamente" })[0]);
    await waitFor(() => expect(auditMutation.mutateAsync).toHaveBeenCalledTimes(2));
    expect(auditMutation.mutateAsync.mock.calls[1][0]).toEqual(originalPayload);
    expect(localStorage.getItem("police-incident-audit-pending-1")).toBeNull();
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

  it("filtra Armados e Desarmados pelo partnerName mesmo com as listas de clientes e parceiras vazias", async () => {
    mockedClientData = [];
    mockedPartnerCompanyData = [];
    mockedArmDisarmStatus = {
      armed: [
        { alarmSystemId: 501, clientId: 51, account: "0501", brand: "COMPATEC", model: "A1", clientName: "Cliente Armado Correspondente", partnerName: "Segurança Águia" },
        { alarmSystemId: 502, clientId: 52, account: "0502", brand: "COMPATEC", model: "A2", clientName: "Cliente Armado Não Correspondente", partnerName: "Outra Parceira" },
      ],
      disarmed: [
        { alarmSystemId: 503, clientId: 53, account: "0503", brand: "COMPATEC", model: "D1", clientName: "Cliente Desarmado Correspondente", partnerName: "Segurança Águia" },
        { alarmSystemId: 504, clientId: 54, account: "0504", brand: "COMPATEC", model: "D2", clientName: "Cliente Desarmado Não Correspondente", partnerName: "Outra Parceira" },
      ],
    };
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: /^Armados \(2\)$/i }));
    const armedHeading = await screen.findByRole("heading", { name: "Clientes Armados (2)" });
    const search = screen.getByPlaceholderText("Buscar por conta, cliente, fantasia ou parceira...");
    await user.type(search, "aguia");

    expect(screen.getByText("Cliente Armado Correspondente")).toBeTruthy();
    expect(screen.getByText("Parceira: Segurança Águia")).toBeTruthy();
    expect(screen.queryByText("Cliente Armado Não Correspondente")).toBeNull();
    expect(screen.queryByText("Cliente Desarmado Correspondente")).toBeNull();

    await user.click(within(armedHeading.parentElement!).getByRole("button"));
    await user.click(screen.getByRole("button", { name: /^Desarmados \(2\)$/i }));
    const disarmedHeading = await screen.findByRole("heading", { name: "Clientes Desarmados (2)" });
    await user.type(screen.getByPlaceholderText("Buscar por conta, cliente, fantasia ou parceira..."), "aguia");

    expect(screen.getByText("Cliente Desarmado Correspondente")).toBeTruthy();
    expect(screen.getByText("Parceira: Segurança Águia")).toBeTruthy();
    expect(screen.queryByText("Cliente Desarmado Não Correspondente")).toBeNull();
    expect(screen.queryByText("Cliente Armado Correspondente")).toBeNull();
    expect(disarmedHeading).toBeTruthy();
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
    if (result.count === 0) {
      expect(screen.getByTestId("active-occurrence-inline")).toBeTruthy();
      expect(screen.getByRole("complementary", { name: "Logs da Ocorrência" })).toBeTruthy();
      expect(screen.queryByText("Outra central da mesma conta")).toBeNull();
    } else {
      expect(screen.queryByTestId("active-occurrence-inline")).toBeNull();
      expect(screen.getByText("Outra central da mesma conta")).toBeTruthy();
    }
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
