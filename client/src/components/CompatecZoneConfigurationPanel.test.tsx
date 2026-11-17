// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompatecZoneConfigurationPanel from "./CompatecZoneConfigurationPanel";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  listInvalidate: vi.fn(),
  queueInvalidate: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    alarmZone: { list: { useQuery: () => ({ data: [
      { id: 1, zoneNumber: 1, name: "Entrada", isActive: true },
      { id: 2, zoneNumber: 2, name: "Recepção", isActive: true },
      { id: 3, zoneNumber: 3, name: "Janela", isActive: true },
      { id: 4, zoneNumber: 4, name: "Depósito", isActive: true },
      { id: 24, zoneNumber: 24, name: "Fora do escopo", isActive: true },
    ], isLoading: false, error: null }) } },
    remoteCommand: { configureCompatecZones: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) } },
    useUtils: () => ({
      remoteCommand: { list: { invalidate: mocks.listInvalidate } },
      incident: { openQueue: { invalidate: mocks.queueInvalidate } },
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { info: mocks.toastInfo, success: mocks.toastSuccess, warning: mocks.toastWarning, error: mocks.toastError } }));

const baseProps = {
  alarmSystemId: 78,
  incidentId: 901,
  leaseToken: "22222222-2222-4222-8222-222222222222",
  account: "0001",
  model: "AW320 PRO",
  macAddress: "C1BDCB",
  receiverPort: 9271,
  canOperate: true,
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("CompatecZoneConfigurationPanel", () => {
  it("mostra setores ativos e esconde os códigos e quadros técnicos do protocolo", () => {
    render(<CompatecZoneConfigurationPanel {...baseProps} />);
    expect(screen.getByRole("heading", { name: "Comandos de zonas e setores" })).toBeTruthy();
    expect(screen.queryByLabelText("Solicitado por")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Estado de arme do setor 1" })).toBeTruthy();
    expect(screen.queryByText("Fora do escopo")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 1" }), { target: { value: "armed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 2" }), { target: { value: "armed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Anulação do setor 3" }), { target: { value: "annulled" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Anulação do setor 4" }), { target: { value: "annulled" } });

    expect(screen.queryByLabelText("Prévia dos quadros AK2 e AK1")).toBeNull();
    expect(screen.queryByText(/MB=AK[0124]\[/)).toBeNull();
    expect(screen.queryByText(/KA1|AK4|AK2/)).toBeNull();
    expect(screen.getByRole("button", { name: "Aplicar alterações · 4 setor(es)" })).toBeTruthy();
  });

  it("confirma conta, ocorrência, alterações e motivo, sem pedir solicitante, e envia tudo numa requisição", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CompatecZoneConfigurationPanel {...baseProps} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 1" }), { target: { value: "armed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 2" }), { target: { value: "disarmed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Anulação do setor 3" }), { target: { value: "annulled" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Descrição / motivo da configuração de setores" }), { target: { value: "Solicitação confirmada pelo responsável" } });
    fireEvent.click(screen.getByRole("button", { name: /Aplicar alterações/ }));

    expect(confirm).toHaveBeenCalledOnce();
    const confirmation = confirm.mock.calls[0][0];
    expect(confirmation).toContain("Conta 0001 · AW320 PRO");
    expect(confirmation).toContain("Ocorrência #901");
    expect(confirmation).not.toContain("Solicitado por");
    expect(confirmation).toContain("Setor 1 · Entrada: Armar");
    expect(confirmation).toContain("Setor 2 · Recepção: Desarmar");
    expect(confirmation).toContain("Descrição / motivo: Solicitação confirmada pelo responsável");
    expect(confirmation).toContain("Esta ação altera somente os setores listados");
    expect(confirmation).not.toContain("C1BDCB");
    expect(confirmation).not.toContain("9271");
    expect(confirmation).not.toMatch(/MB=|AK[0124]|KA1/);
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({
      alarmSystemId: 78,
      incidentId: 901,
      leaseToken: baseProps.leaseToken,
      reason: "Solicitação confirmada pelo responsável",
      zoneChanges: [
        { zoneNumber: 1, armState: "armed" },
        { zoneNumber: 2, armState: "disarmed" },
        { zoneNumber: 3, bypassState: "annulled" },
      ],
    });
  });

  it("bloqueia envio se faltar lease, MAC/IMEI de 6 hex ou porta", () => {
    const { rerender } = render(<CompatecZoneConfigurationPanel {...baseProps} leaseToken={undefined} />);
    expect((screen.getByRole("button", { name: /Aplicar alterações/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Abra ou assuma o atendimento/)).toBeTruthy();
    rerender(<CompatecZoneConfigurationPanel {...baseProps} macAddress={undefined} imeiGprs={undefined} receiverPort={9271} />);
    expect((screen.getByRole("button", { name: /Aplicar alterações/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/identificação da central incompleta/)).toBeTruthy();
    rerender(<CompatecZoneConfigurationPanel {...baseProps} receiverPort={undefined} />);
    expect((screen.getByRole("button", { name: /Aplicar alterações/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("não envia se o operador cancelar a confirmação", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CompatecZoneConfigurationPanel {...baseProps} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 1" }), { target: { value: "armed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Descrição / motivo da configuração de setores" }), { target: { value: "Pedido do responsável" } });
    fireEvent.click(screen.getByRole("button", { name: /Aplicar alterações/ }));
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
