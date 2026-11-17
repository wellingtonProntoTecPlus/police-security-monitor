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
vi.mock("sonner", () => ({ toast: { info: mocks.toastInfo, warning: mocks.toastWarning, error: mocks.toastError } }));

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
  it("mostra somente setores ativos 1–23 e gera a prévia oficial AK2→AK1 sem AK4", () => {
    render(<CompatecZoneConfigurationPanel {...baseProps} />);
    expect(screen.getByRole("combobox", { name: "Estado de arme do setor 1" })).toBeTruthy();
    expect(screen.queryByText("Fora do escopo")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 1" }), { target: { value: "armed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 2" }), { target: { value: "armed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Anulação do setor 3" }), { target: { value: "annulled" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Anulação do setor 4" }), { target: { value: "annulled" } });

    const preview = screen.getByLabelText("Prévia dos quadros AK2 e AK1");
    expect(preview.textContent).toContain("MB=AK2[0080,0080,0008,0008,");
    expect(preview.textContent).toContain("MB=AK1[0080,0080,0008,0008,");
    expect(preview.textContent).not.toContain("MB=AK4");
    expect(screen.getByText(/Não há terceiro quadro AK4/)).toBeTruthy();
  });

  it("confirma identidade física, porta, solicitante, motivo e envia todas as alterações em uma requisição", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CompatecZoneConfigurationPanel {...baseProps} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 1" }), { target: { value: "armed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 2" }), { target: { value: "disarmed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Anulação do setor 3" }), { target: { value: "annulled" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Solicitado por" }), { target: { value: "Sr. Wellington" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Motivo operacional da configuração de setores" }), { target: { value: "Solicitação confirmada pelo responsável" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar configuração AK2→AK1/ }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toContain("MAC C1BDCB · Porta do receptor 9271");
    expect(confirm.mock.calls[0][0]).toMatch(/resposta esperada é KA1/i);
    expect(confirm.mock.calls[0][0]).not.toContain("AK4[4]");
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({
      alarmSystemId: 78,
      incidentId: 901,
      leaseToken: baseProps.leaseToken,
      requestedBy: "Sr. Wellington",
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
    expect((screen.getByRole("button", { name: /Enviar configuração AK2→AK1/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Abra ou assuma o painel/)).toBeTruthy();
    rerender(<CompatecZoneConfigurationPanel {...baseProps} macAddress={undefined} imeiGprs={undefined} receiverPort={9271} />);
    expect((screen.getByRole("button", { name: /Enviar configuração AK2→AK1/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/MAC ou IMEI de 6 caracteres hexadecimais/)).toBeTruthy();
    rerender(<CompatecZoneConfigurationPanel {...baseProps} receiverPort={undefined} />);
    expect((screen.getByRole("button", { name: /Enviar configuração AK2→AK1/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("não envia se o operador cancelar a confirmação", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CompatecZoneConfigurationPanel {...baseProps} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Estado de arme do setor 1" }), { target: { value: "armed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Solicitado por" }), { target: { value: "Cliente" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Motivo operacional da configuração de setores" }), { target: { value: "Pedido do responsável" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar configuração AK2→AK1/ }));
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
