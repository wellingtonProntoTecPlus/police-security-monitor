// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/lib/trpc", () => ({
  trpc: {
    occurrence: { create: { useMutation: () => standardMutation } },
    alarmEvent: { createManual: { useMutation: () => manualMutation } },
    incident: {
      update: { useMutation: () => standardMutation },
      openQueue: { useQuery: () => ({ data: [], isLoading: false }) },
    },
    finalization: { list: { useQuery: () => ({ data: [] }) } },
    auth: {
      login: { useMutation: () => standardMutation },
      logout: { useMutation: () => standardMutation },
    },
    monitoredClient: { list: { useQuery: () => ({ data: [] }) } },
    alarmSystem: { list: { useQuery: () => ({ data: [] }) } },
    dashboard: {
      armDisarmStatus: { useQuery: () => ({ data: { armed: [], disarmed: [] } }) },
      connectionStatus: { useQuery: () => ({ data: [] }) },
    },
    camera: { list: { useQuery: () => ({ data: [] }) } },
  },
}));

vi.mock("@/hooks/useSocket", () => ({
  useSocket: () => ({ connected: true, realtimeEvents: [] }),
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

  it("pede a senha em confirmação nativa ao desativar o áudio, sem montar um modal React", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("SenhaConfirmada123");
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Ativar áudio" }));
    await screen.findByRole("button", { name: "Áudio ativo" });
    await user.click(screen.getByRole("button", { name: "Áudio ativo" }));

    expect(promptSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(standardMutation.mutateAsync).toHaveBeenCalledWith({
        email: "wellingtonportes@gmail.com",
        password: "SenhaConfirmada123",
      });
    });
  });
});
