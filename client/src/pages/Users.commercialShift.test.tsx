// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPERATOR_SHIFT_LABELS } from "@shared/operatorShift";
import UsersPage from "./Users";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  systemUser: {
    list: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
    shiftAssignments: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
    create: { useMutation: () => ({ mutate: create, isPending: false }) },
    update: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
  },
  partnerCompany: { list: { useQuery: () => ({ data: [] }) } },
} }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/WorkspaceScreenMenu", () => ({ default: () => null }));
vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: any) => <div>{children}</div> }));
// Native select retains real form state and payload while avoiding unrelated Radix portal APIs in jsdom.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Comercial no cadastro de usuário", () => {
  it("seleciona Comercial, oculta âncora alternada e salva vigência semanal", () => {
    const { container } = render(<UsersPage />);
    fireEvent.click(screen.getByRole("button", { name: /Novo Usuário/ }));
    const option = screen.getByRole("option", { name: OPERATOR_SHIFT_LABELS.commercial });
    fireEvent.change(option.closest("select")!, { target: { value: "commercial" } });
    expect(screen.getByText(/Sábado e domingo são folga; não usa alternância/)).toBeTruthy();
    expect(screen.queryByText("Data do primeiro dia trabalhado do ciclo")).toBeNull();
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText("Nome completo"), { target: { value: "Operador Comercial" } });
    fireEvent.change(screen.getByPlaceholderText("email@empresa.com"), { target: { value: "comercial@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Senha de acesso"), { target: { value: "SenhaTeste123" } });
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: "2026-11-09" } });
    fireEvent.change(screen.getByPlaceholderText("Ex.: escala ajustada em acordo"), { target: { value: "Escala comercial inicial" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ shiftAssignment: {
      shiftCode: "commercial", effectiveFromDate: "2026-11-09", cycleAnchorDate: "2026-11-09", changeReason: "Escala comercial inicial",
    } }));
  });
});
