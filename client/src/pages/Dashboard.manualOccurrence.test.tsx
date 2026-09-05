// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

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
      update: { useMutation: () => standardMutation },
      observe: { useMutation: () => standardMutation },
      openQueue: {
        useQuery: () => ({
          data: [{
            id: 701,
            incidentId: 91,
            incidentStatus: "waiting",
            incidentClientId: 4,
            incidentSystemId: 6,
            account: "0001",
            brand: "COMPATEC",
            qualifier: "E",
            eventCode: "130",
            description: "Disparo de alarme",
            priority: "critical",
            receivedAt: new Date("2026-08-12T12:00:00.000Z"),
          }],
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
      startMaintenance: { useMutation: () => standardMutation },
      endMaintenance: { useMutation: () => standardMutation },
    },
    alarmPgm: { list: { useQuery: () => ({ data: [] }) } },
    remoteCommand: {
      list: { useQuery: () => ({ data: [] }) },
      simulate: { useMutation: () => standardMutation },
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
      connectionStatus: { useQuery: () => ({ data: [] }) },
    },
    camera: { list: { useQuery: () => ({ data: [] }) } },
    useUtils: () => ({
      incident: { openQueue: { invalidate: invalidateOpenQueue } },
      alarmSystem: { list: { invalidate: vi.fn().mockResolvedValue(undefined) } },
      remoteCommand: { list: { invalidate: vi.fn().mockResolvedValue(undefined) } },
      dashboard: {
        connectionStatus: { invalidate: invalidateConnectionStatus },
        armDisarmStatus: { invalidate: invalidateArmDisarmStatus },
        recentAutoFinalizedArmDisarm: { invalidate: invalidateRecentAutoFinalizedArmDisarm },
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
      { kind: "arm_disarm_confirmation", alarmSystemId: 55, account: "0029", brand: "JFL", qualifier: "R", eventCode: "407", timestamp: "2026-09-05T23:30:01.000Z" },
    ];

    render(<Dashboard />);

    await waitFor(() => {
      expect(invalidateConnectionStatus).toHaveBeenCalledTimes(1);
      expect(invalidateArmDisarmStatus).toHaveBeenCalledTimes(1);
      expect(invalidateRecentAutoFinalizedArmDisarm).toHaveBeenCalledTimes(1);
    });
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

  it("exibe a confirmação de Arme ou Desarme recebida e finalizada automaticamente", () => {
    render(<Dashboard />);

    expect(screen.getByText("Última confirmação automática")).toBeTruthy();
    expect(screen.getByText(/ARMADO · Conta 0336 · VETTI · Arme/)).toBeTruthy();
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
