// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import OperatorHandoffMessageDialog from "./OperatorHandoffMessageDialog";

const mocks = vi.hoisted(() => ({ directSend: vi.fn(), groupSend: vi.fn() }));
vi.mock("@/lib/trpc", () => {
  const mutation = (mutate: ReturnType<typeof vi.fn>) => ({ mutate, mutateAsync: vi.fn(), isPending: false, error: null });
  return { trpc: {
    operatorShift: {
      recipients: { useQuery: () => ({ data: [{ id: 12, name: "Yasmin" }], error: null }) },
      messageGroups: { useQuery: () => ({ data: [{ id: 7, name: "Operadoras da noite" }], error: null, isLoading: false }) },
      sendMessage: { useMutation: () => mutation(mocks.directSend) },
      sendGroupMessage: { useMutation: () => mutation(mocks.groupSend) },
    },
  } };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><OperatorHandoffMessageDialog onClose={vi.fn()} /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("OperatorHandoffMessageDialog", () => {
  it("preserva o envio individual para uma pessoa", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.selectOptions(screen.getByRole("combobox", { name: "Destinatário da mensagem" }), "12");
    await user.type(screen.getByRole("textbox", { name: "Mensagem" }), "Recado individual suficientemente longo.");
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    expect(mocks.directSend).toHaveBeenCalledWith({ toUserId: 12, message: "Recado individual suficientemente longo." });
    expect(mocks.groupSend).not.toHaveBeenCalled();
  });

  it("permite selecionar um grupo e envia uma única mensagem ao grupo escolhido", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("tab", { name: "Um grupo" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Grupo destinatário da mensagem" }), "7");
    await user.type(screen.getByRole("textbox", { name: "Mensagem" }), "Recado para todas as operadoras do turno.");
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    expect(mocks.groupSend).toHaveBeenCalledWith({ groupId: 7, message: "Recado para todas as operadoras do turno." });
    expect(mocks.directSend).not.toHaveBeenCalled();
  });
});
