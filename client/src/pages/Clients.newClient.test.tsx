// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Clients from "./Clients";

const standardMutation = {
  mutate: vi.fn(),
  isPending: false,
};
const clientFixtures = [
  { id: 1, partnerCompanyId: 1, type: "pj", name: "Ativo Válido", isActive: true, monitoringStatus: "active", accounts: [] },
  { id: 2, partnerCompanyId: 1, type: "pj", name: "Suspenso Válido", isActive: true, monitoringStatus: "suspended", monitoringStatusUntil: "2099-01-01T00:00:00.000Z", accounts: [] },
  { id: 3, partnerCompanyId: 1, type: "pj", name: "Bloqueado Válido", isActive: true, monitoringStatus: "blocked", accounts: [] },
  { id: 4, partnerCompanyId: 1, type: "pj", name: "Suspensão Expirada", isActive: true, monitoringStatus: "suspended", monitoringStatusUntil: "2000-01-01T00:00:00.000Z", accounts: [] },
  { id: 5, partnerCompanyId: 1, type: "pj", name: "Cliente Dois Sistemas", isActive: true, monitoringStatus: "active", accounts: ["0101", "0102"] },
];
const systemsForClient = [
  { id: 51, clientId: 5, account: "0101", brand: "JFL", model: "Active 8W" },
  { id: 52, clientId: 5, account: "0102", brand: "COMPATEC", model: "AW32" },
];

vi.mock("@/lib/trpc", () => ({
  trpc: {
    monitoredClient: {
      list: { useQuery: (input?: { monitoringStatus?: string }) => ({ data: input?.monitoringStatus ? clientFixtures.filter((client) => input.monitoringStatus === "active" ? client.monitoringStatus === "active" || (client.monitoringStatus === "suspended" && new Date(client.monitoringStatusUntil!) < new Date()) : client.monitoringStatus === input.monitoringStatus) : clientFixtures, refetch: vi.fn() }) },
      create: { useMutation: () => standardMutation },
      update: { useMutation: () => standardMutation },
      delete: { useMutation: () => standardMutation },
    },
    alarmSystem: {
      list: { useQuery: (input?: { clientId?: number }) => ({ data: input?.clientId === 5 ? systemsForClient : [], isLoading: false, isError: false }) },
    },
    partnerCompany: {
      list: { useQuery: () => ({ data: [{ id: 1, name: "Police Electronics", cnpj: "04252011000110", phone: "44999999999", email: "central@example.com", address: "Rua Central", city: "Maringá", state: "PR", zipCode: "87000000" }] }) },
    },
  },
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/WorkspaceScreenMenu", () => ({
  default: () => <button type="button">Outras telas</button>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange: (value: string) => void; children: ReactNode }) => <select value={value || ""} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder || "Selecionar"}</>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/clients", vi.fn()],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("Clientes — Novo Cliente", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("abre o formulário no próximo ciclo após o clique, sem desmontagem imediata", async () => {
    const user = userEvent.setup();
    render(<Clients />);

    await user.click(screen.getByRole("button", { name: /novo cliente/i }));

    expect(await screen.findByRole("heading", { name: /cadastrar novo cliente/i })).toBeTruthy();
    expect(screen.getByText("Empresa Responsável")).toBeTruthy();
    expect(screen.getByText("Situação do Monitoramento")).toBeTruthy();
    expect(screen.getByRole("button", { name: /cadastrar cliente/i })).toBeTruthy();
  });

  it("avisa com a frase solicitada e carrega dados da própria parceira antes de permitir o cadastro", async () => {
    const user = userEvent.setup();
    render(<Clients />);
    await user.click(screen.getByRole("button", { name: /novo cliente/i }));
    await screen.findByRole("heading", { name: /cadastrar novo cliente/i });
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "1");
    await user.type(screen.getByPlaceholderText("00.000.000/0000-00"), "04252011000110");
    await user.tab();

    expect(await screen.findByRole("heading", { name: "CNPJ CADASTRADO. DESEJA CONTINUAR?" })).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText(/Police Electronics/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sim, continuar" }));
    expect(screen.getAllByDisplayValue("Police Electronics").some((element) => element.tagName === "INPUT")).toBe(true);
    await user.click(screen.getByRole("button", { name: /cadastrar cliente/i }));
    expect(standardMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({
      partnerCompanyId: 1, type: "pj", propertyType: "company", name: "Police Electronics",
      document: "04252011000110", confirmPartnerDocumentReuse: true,
    }));
  });

  it("filtra clientes por Ativo, Suspenso e Bloqueado, tratando suspensão vencida como Ativo", async () => {
    const user = userEvent.setup();
    render(<Clients />);
    const status = screen.getAllByRole("combobox")[1];
    await user.selectOptions(status, "suspended");
    expect(screen.getByText("Suspenso Válido")).toBeTruthy();
    expect(screen.queryByText("Ativo Válido")).toBeNull();
    await user.selectOptions(status, "blocked");
    expect(screen.getByText("Bloqueado Válido")).toBeTruthy();
    expect(screen.queryByText("Suspenso Válido")).toBeNull();
    await user.selectOptions(status, "active");
    expect(screen.getByText("Suspensão Expirada")).toBeTruthy();
    expect(screen.queryByText("Bloqueado Válido")).toBeNull();
  });

  it("identifica o cliente e enumera todos os sistemas antes de confirmar o bloqueio", async () => {
    const user = userEvent.setup();
    render(<Clients />);
    const clientName = screen.getByText("Cliente Dois Sistemas");
    const clientRow = clientName.closest("div.grid");
    expect(clientRow).toBeTruthy();
    await user.click(within(clientRow as HTMLElement).getByTitle("Editar cliente"));
    await screen.findByRole("heading", { name: "Editar Cliente" });

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[3], "blocked");
    await user.type(screen.getByPlaceholderText("Ex.: pendência financeira"), "Inadimplência");
    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Cliente Dois Sistemas/)).toBeTruthy();
    expect(within(dialog).getByRole("list", { name: "Sistemas afetados" }).textContent).toContain("0101");
    expect(within(dialog).getByRole("list", { name: "Sistemas afetados" }).textContent).toContain("0102");
    expect(standardMutation.mutate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Confirmar bloqueio" }));
    expect(standardMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({
      id: 5, monitoringStatus: "blocked", monitoringStatusReason: "Inadimplência",
    }));
  });
});
