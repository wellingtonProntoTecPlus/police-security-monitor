// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompatecCommandReconciliationPanel from "./CompatecCommandReconciliationPanel";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  listInvalidate: vi.fn(),
  indeterminateInvalidate: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

const commands = [{
  id: 77,
  incidentId: 901,
  operatorName: "Operador anterior",
  commandType: "configure_zones",
  status: "dispatch_unknown",
  reason: "Solicitação do responsável",
  commandPayload: JSON.stringify({ zoneChanges: [
    { zoneNumber: 1, armState: "armed" },
    { zoneNumber: 2, bypassState: "annulled" },
  ] }),
  responsePayload: "KA1 não recebido no prazo",
  createdAt: new Date("2026-11-17T12:00:00Z"),
}];

vi.mock("@/lib/trpc", () => ({
  trpc: {
    remoteCommand: {
      indeterminateCompatec: { useQuery: () => ({ data: commands, isLoading: false, error: null }) },
      reconcileCompatecCommand: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
      list: { useQuery: () => ({ data: [] }) },
    },
    useUtils: () => ({ remoteCommand: {
      list: { invalidate: mocks.listInvalidate },
      indeterminateCompatec: { invalidate: mocks.indeterminateInvalidate },
    } }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, warning: mocks.toastWarning, error: mocks.toastError } }));

beforeEach(() => {
  vi.clearAllMocks();
  commands[0].responsePayload = "KA1 não recebido no prazo";
});
afterEach(() => cleanup());

describe("CompatecCommandReconciliationPanel", () => {
  it("mostra comandos indeterminados e exige resultado, método e detalhes antes de registrar", () => {
    render(<CompatecCommandReconciliationPanel alarmSystemId={78} />);
    expect(screen.getByText("Comando sem resultado confirmado")).toBeTruthy();
    expect(screen.getByText(/não bloqueiam novas solicitações/)).toBeTruthy();
    expect(screen.getByText("#77 · Configuração de setores AK2→AK1")).toBeTruthy();
    expect(screen.getByText(/Executado por Operador anterior/)).toBeTruthy();
    expect(screen.queryByText(/Solicitado por Operador anterior/)).toBeNull();
    expect(screen.getByText(/Setor 1: Armar · Setor 2: Anular/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Registrar conferência" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("registra conferência manual após confirmação, sem campos forjados nem transmissão física", () => {
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CompatecCommandReconciliationPanel alarmSystemId={78} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Resultado da conferência do comando 77" }), { target: { value: "applied" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Fonte da conferência do comando 77" }), { target: { value: "panel_event_history" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado observado no comando 77" }), { target: { value: "all_targets_applied" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Referência da evidência do comando 77" }), { target: { value: "Eventos #12345 e #12346" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Método de conferência do comando 77" }), { target: { value: "Aplicativo Compatec" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Detalhes da conferência do comando 77" }), { target: { value: "Setores 1 e 2 conferidos no aplicativo" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar conferência" }));

    expect(confirmation).toHaveBeenCalledOnce();
    expect(confirmation.mock.calls[0][0]).toContain("NÃO bloqueia novas solicitações");
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({
      commandId: 77,
      outcome: "applied",
      verificationMethod: "Aplicativo Compatec",
      details: "Setores 1 e 2 conferidos no aplicativo",
      verificationSource: "panel_event_history",
      observedState: "all_targets_applied",
      evidenceReference: "Eventos #12345 e #12346",
    });
  });

  it("não altera o registro quando o operador cancela a confirmação", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CompatecCommandReconciliationPanel alarmSystemId={78} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Resultado da conferência do comando 77" }), { target: { value: "not_applied" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Fonte da conferência do comando 77" }), { target: { value: "official_app_command_history" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado observado no comando 77" }), { target: { value: "all_targets_unchanged" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Referência da evidência do comando 77" }), { target: { value: "Registro #APP-12345" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Método de conferência do comando 77" }), { target: { value: "Ligação ao responsável" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Detalhes da conferência do comando 77" }), { target: { value: "Responsável conferiu os setores" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar não aplicado" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("não habilita a liberação com relato externo e mostra por que ele não é evidência direta", () => {
    render(<CompatecCommandReconciliationPanel alarmSystemId={78} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Resultado da conferência do comando 77" }), { target: { value: "not_applied" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Fonte da conferência do comando 77" }), { target: { value: "external_report" } });
    expect(screen.getByText(/Relato externo é identificado separadamente/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Registrar não aplicado" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("mantém a conferência final após aplicação parcial sem alegar bloqueio", () => {
    commands[0].responsePayload = "[CONFERÊNCIA MANUAL: APLICAÇÃO PARCIAL]";
    render(<CompatecCommandReconciliationPanel alarmSystemId={78} />);
    expect(screen.getByText(/A aplicação já foi registrada em uma conferência anterior/)).toBeTruthy();
    const outcome = screen.getByRole("combobox", { name: "Resultado da conferência do comando 77" }) as HTMLSelectElement;
    expect(Array.from(outcome.options).map((option) => option.value)).toEqual(["", "partial", "verified"]);
    fireEvent.change(outcome, { target: { value: "verified" } });
    expect(screen.getByRole("button", { name: "Registrar estado final confirmado" })).toBeTruthy();
  });
});
