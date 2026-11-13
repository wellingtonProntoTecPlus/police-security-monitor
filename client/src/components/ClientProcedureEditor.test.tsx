// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientProcedureEditor from "./ClientProcedureEditor";

const mocks = vi.hoisted(() => ({
  role: "admin" as string,
  rows: [] as Array<Record<string, unknown>>,
  queryState: "success" as "success" | "loading" | "error",
  listInput: vi.fn(),
  refetch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deactivate: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 5, role: mocks.role } }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    clientProcedure: {
      list: {
        useQuery: (input: unknown) => {
          mocks.listInput(input);
          return {
            data: mocks.rows,
            isLoading: mocks.queryState === "loading",
            isError: mocks.queryState === "error",
            error: mocks.queryState === "error" ? new Error("Falha de consulta") : null,
            refetch: mocks.refetch,
          };
        },
      },
      create: { useMutation: () => ({ mutateAsync: mocks.create, isPending: false }) },
      update: { useMutation: () => ({ mutateAsync: mocks.update, isPending: false }) },
      deactivate: { useMutation: () => ({ mutateAsync: mocks.deactivate, isPending: false }) },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess } }));

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "admin";
  mocks.rows = [];
  mocks.queryState = "success";
  mocks.refetch.mockResolvedValue({ data: [] });
  mocks.create.mockResolvedValue({ id: 101 });
  mocks.update.mockResolvedValue({ id: 101 });
  mocks.deactivate.mockResolvedValue({ success: true });
});

const activeProcedure = {
  id: 21,
  clientId: 704,
  title: "Procedimento existente",
  description: "Consultar instrução aprovada.",
  procedureType: "alarm",
  priority: 2,
  isActive: true,
};

const inactiveProcedure = {
  ...activeProcedure,
  id: 22,
  title: "Procedimento arquivado",
  isActive: false,
};

describe("ClientProcedureEditor", () => {
  it("cadastra uma providência com categoria e prioridade no cliente recebido", async () => {
    const user = userEvent.setup();
    render(<ClientProcedureEditor clientId={704} />);

    expect(mocks.listInput).toHaveBeenCalledWith({ clientId: 704 });
    await user.click(screen.getByRole("button", { name: "Adicionar providência" }));
    await user.type(screen.getByRole("textbox", { name: "Título" }), "Aguardar validação do responsável");
    await user.type(screen.getByRole("textbox", { name: "Instrução" }), "Consultar a instrução aprovada no cadastro.");
    await user.selectOptions(screen.getByRole("combobox", { name: "Categoria" }), "panic");
    await user.clear(screen.getByRole("spinbutton", { name: "Ordem de exibição" }));
    await user.type(screen.getByRole("spinbutton", { name: "Ordem de exibição" }), "4");
    await user.click(screen.getByRole("button", { name: "Salvar providência" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      clientId: 704,
      title: "Aguardar validação do responsável",
      description: "Consultar a instrução aprovada no cadastro.",
      procedureType: "panic",
      priority: 4,
    }));
    expect(await screen.queryByRole("dialog")).toBeNull();
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Providência cadastrada.");
  });

  it("mantém diálogo e dados preenchidos se a API rejeitar o cadastro", async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(new Error("Falha ao gravar"));
    render(<ClientProcedureEditor clientId={704} />);

    await user.click(screen.getByRole("button", { name: "Adicionar providência" }));
    await user.type(screen.getByRole("textbox", { name: "Título" }), "Nova orientação");
    await user.type(screen.getByRole("textbox", { name: "Instrução" }), "Texto da orientação.");
    await user.click(screen.getByRole("button", { name: "Salvar providência" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Falha ao gravar");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Título" }) as HTMLInputElement).value).toBe("Nova orientação");
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it("confirma inativação sem exclusão permanente e refaz a consulta", async () => {
    const user = userEvent.setup();
    mocks.rows = [activeProcedure];
    render(<ClientProcedureEditor clientId={704} />);

    await user.click(screen.getByRole("button", { name: "Inativar" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/O registro será preservado/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar inativação" }));

    await waitFor(() => expect(mocks.deactivate).toHaveBeenCalledWith({ id: 21 }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Providência inativada. O registro foi preservado.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("permite reativar um registro inativo via update e preserva sua identidade", async () => {
    const user = userEvent.setup();
    mocks.rows = [inactiveProcedure];
    render(<ClientProcedureEditor clientId={704} />);

    expect(screen.getByText("Inativa")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reativar" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 22, isActive: true }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.deactivate).not.toHaveBeenCalled();
  });

  it("apresenta as instruções em modo somente leitura para operador", () => {
    mocks.role = "operator";
    mocks.rows = [activeProcedure, inactiveProcedure];
    render(<ClientProcedureEditor clientId={704} />);

    expect(screen.getByText(/instruções aprovadas pelo responsável/)).toBeTruthy();
    expect(screen.getAllByText("Consultar instrução aprovada.")).toHaveLength(2);
    expect(screen.getByText("Procedimento arquivado")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Adicionar providência" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Inativar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reativar" })).toBeNull();
  });

  it("mostra estado vazio quando a lista do cliente não tem providências", () => {
    render(<ClientProcedureEditor clientId={704} />);
    expect((screen.getByRole("status")).textContent).toContain("Nenhuma providência cadastrada para este cliente.");
  });

  it("expõe erro de consulta e oferece nova tentativa", async () => {
    const user = userEvent.setup();
    mocks.queryState = "error";
    render(<ClientProcedureEditor clientId={704} />);

    expect((screen.getByRole("alert")).textContent).toContain("Não foi possível carregar as providências deste cliente.");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("mostra carregamento enquanto aguarda a lista do cliente", () => {
    mocks.queryState = "loading";
    render(<ClientProcedureEditor clientId={704} />);
    expect((screen.getByRole("status")).textContent).toContain("Carregando providências");
  });
});
