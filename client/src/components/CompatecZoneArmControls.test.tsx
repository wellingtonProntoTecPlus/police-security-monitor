// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompatecZoneArmControls from "./CompatecZoneArmControls";

const mocks = vi.hoisted(() => ({
  selection: vi.fn(), arm: vi.fn(), physicalZone: vi.fn(), invalidate: vi.fn(),
  toastSuccess: vi.fn(), toastError: vi.fn(), rows: [] as any[], queryError: null as any,
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  alarmZone: { list: { useQuery: () => ({ data: [{ id: 3, zoneNumber: 3, name: "Janela", isActive: true }, { id: 8, zoneNumber: 8, name: "Inativa", isActive: false }], isLoading: false }) } },
  remoteCommand: {
    compatecZoneSelections: { useQuery: () => ({ data: mocks.rows, error: mocks.queryError, isLoading: false }) },
    selectCompatecZoneForArm: { useMutation: () => ({ mutate: mocks.selection, isPending: false }) },
    armCompatecAll: { useMutation: () => ({ mutate: mocks.arm }) },
    compatecZonePhysical: { useMutation: () => ({ mutate: mocks.physicalZone }) },
  },
  useUtils: () => ({ remoteCommand: { compatecZoneSelections: { invalidate: mocks.invalidate } } }),
} }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T23:00:00Z"));
  vi.clearAllMocks(); mocks.rows = []; mocks.queryError = null;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Chave Compatec antes do Arme", () => {
  it("marca apenas a intenção por central e zona e nunca transmite inibição nem Arme", () => {
    render(<CompatecZoneArmControls alarmSystemId={42} />);
    fireEvent.click(screen.getByRole("switch", { name: "Inibir zona 3" }));
    expect(mocks.selection).toHaveBeenCalledWith({ alarmSystemId: 42, zoneNumber: 3, selected: true });
    expect(mocks.arm).not.toHaveBeenCalled(); expect(mocks.physicalZone).not.toHaveBeenCalled();
    expect(screen.queryByRole("switch", { name: "Inibir zona 8" })).toBeNull();
  });
  it("volta ao estado normal em 1 minuto sem mensagem nem comando de restauração", () => {
    mocks.rows = [{ id: 1, zoneNumber: 3, expiresAt: new Date(Date.now() + 60_000), armCommandId: null }];
    render(<CompatecZoneArmControls alarmSystemId={42} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    act(() => { vi.advanceTimersByTime(60_020); });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(mocks.selection).not.toHaveBeenCalled(); expect(mocks.arm).not.toHaveBeenCalled();
    expect(mocks.physicalZone).not.toHaveBeenCalled(); expect(mocks.toastSuccess).not.toHaveBeenCalled(); expect(mocks.toastError).not.toHaveBeenCalled();
  });
  it("conserva a chave usada no Arme até o Desarme real e não afirma estado físico confirmado", () => {
    mocks.rows = [{ id: 1, zoneNumber: 3, expiresAt: new Date(Date.now() - 10_000), armCommandId: 61 }];
    const view = render(<CompatecZoneArmControls alarmSystemId={42} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("switch") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Solicitada no Arme #61/)).toBeTruthy();
    mocks.rows = []; view.rerender(<CompatecZoneArmControls alarmSystemId={42} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });
  it("bloqueia controles se não puder consultar a fonte persistida", () => {
    mocks.queryError = new Error("indisponível");
    render(<CompatecZoneArmControls alarmSystemId={42} />);
    expect(screen.getByRole("alert")).toBeTruthy(); expect(screen.queryByRole("switch")).toBeNull();
  });
});
