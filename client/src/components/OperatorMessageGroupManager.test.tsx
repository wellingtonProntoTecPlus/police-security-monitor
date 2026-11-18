// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import OperatorMessageGroupManager from "./OperatorMessageGroupManager";

const mocks = vi.hoisted(() => ({ save: vi.fn(), deactivate: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 5, name: "Supervisora", role: "supervisor" } }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ operatorShift: { managedMessageGroups: { invalidate: mocks.invalidate }, messageGroups: { invalidate: mocks.invalidate } } }),
    operatorShift: {
      managedMessageGroups: { useQuery: () => ({ data: [{ id: 7, name: "Operadoras da noite", isActive: true, members: [{ userId: 2, name: "Yasmin", role: "operator" }] }], isLoading: false, error: null }) },
      messageGroupUsers: { useQuery: () => ({ data: [{ id: 2, name: "Yasmin", role: "operator" }, { id: 3, name: "Amanda", role: "operator" }], isLoading: false, error: null }) },
      saveMessageGroup: { useMutation: () => ({ mutate: mocks.save, isPending: false }) },
      deactivateMessageGroup: { useMutation: () => ({ mutate: mocks.deactivate, isPending: false }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderManager() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><OperatorMessageGroupManager /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("OperatorMessageGroupManager", () => {
  it("cria grupo com participantes escolhidos", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.type(screen.getByRole("textbox", { name: "Nome do grupo de mensagens" }), "Equipe da tarde");
    await user.click(screen.getByRole("checkbox", { name: "Incluir Yasmin no grupo" }));
    await user.click(screen.getByRole("checkbox", { name: "Incluir Amanda no grupo" }));
    await user.click(screen.getByRole("button", { name: "Criar grupo" }));
    expect(mocks.save).toHaveBeenCalledWith({ name: "Equipe da tarde", memberUserIds: [2, 3] });
  });

  it("permite remover participante e salvar mantendo o grupo", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const yasmin = screen.getByRole("checkbox", { name: "Incluir Yasmin no grupo" });
    expect((yasmin as HTMLInputElement).checked).toBe(true);
    await user.click(yasmin);
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(mocks.save).toHaveBeenCalledWith({ groupId: 7, name: "Operadoras da noite", memberUserIds: [] });
  });
});
