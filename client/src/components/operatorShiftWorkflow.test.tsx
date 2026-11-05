// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardLayout from "./DashboardLayout";

const mockState = vi.hoisted(() => ({
  user: { id: 1, name: "Carlos", email: "carlos@example.com", role: "operator" },
  logout: vi.fn(),
  refresh: vi.fn(),
  operatorNotices: [] as unknown[],
  previewData: null as any,
  inboxData: [] as any[],
  remindersData: [] as any[],
  previewRefetch: vi.fn(),
  inboxRefetch: vi.fn(),
  remindersRefetch: vi.fn(),
  inboxQueryResults: [] as Array<ReturnType<typeof vi.fn>>,
  remindersQueryResults: [] as Array<ReturnType<typeof vi.fn>>,
  dynamicQueryObjects: false,
  setLocation: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockState.user,
    loading: false,
    error: null,
    refresh: mockState.refresh,
    logout: mockState.logout,
  }),
}));

vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/useSocket", () => ({
  useSocket: (_options?: unknown) => ({
    connected: false,
    realtimeEvents: [],
    incidentUpdates: [],
    operatorNotices: mockState.operatorNotices,
    clearEvents: vi.fn(),
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useLocation: () => ["/dashboard", mockState.setLocation],
}));

vi.mock("@/components/WorkspaceScreenMenu", () => ({
  default: () => <button type="button">Outras telas</button>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
  });

  return {
    trpc: {
      auth: {
        changeOwnPassword: { useMutation: mutation },
      },
      operatorShift: {
        loginScheduleDecision: { useQuery: () => ({ data: { required: false, scheduleStatus: "scheduled" }, isError: false, isFetching: false, error: null, refetch: vi.fn() }) },
        confirmLoginScheduleException: { useMutation: mutation },
        logoutPreview: {
          useQuery: () => ({
            data: mockState.previewData,
            dataUpdatedAt: 1,
            isLoading: false,
            isFetching: false,
            error: null,
            refetch: mockState.previewRefetch,
          }),
        },
        inbox: {
          useQuery: () => {
            const [, rerender] = useState(0);
            const refetch = mockState.dynamicQueryObjects
              ? vi.fn().mockImplementation(async () => { rerender((value) => value + 1); })
              : mockState.inboxRefetch;
            mockState.inboxQueryResults.push(refetch);
            return {
              data: mockState.inboxData,
              isLoading: false,
              isFetching: false,
              error: null,
              refetch,
            };
          },
        },
        pendingReminders: {
          useQuery: () => {
            const [, rerender] = useState(0);
            const refetch = mockState.dynamicQueryObjects
              ? vi.fn().mockImplementation(async () => { rerender((value) => value + 1); })
              : mockState.remindersRefetch;
            mockState.remindersQueryResults.push(refetch);
            return {
              data: mockState.remindersData,
              isLoading: false,
              isFetching: false,
              error: null,
              refetch,
            };
          },
        },
        markRead: { useMutation: mutation },
        acknowledgeReminder: { useMutation: mutation },
        recipients: { useQuery: () => ({ data: [], error: null }) },
        sendMessage: { useMutation: mutation },
      },
    },
  };
});

function previewWithPendingIncident() {
  return {
    pendingIncidents: [{
      incidentId: 17,
      account: "ACCT-17",
      description: "Cerca violada",
      eventCode: "130",
      status: "attending",
      notes: "Status inicial registrado pela central.",
      observationUntil: null,
    }],
    nextOperators: [{ userId: 2, name: "Yasmin", shiftCode: "second" }],
    availableRecipients: [{ userId: 3, name: "Rafael", shiftCode: "third" }],
    fallbackRecipients: false,
  };
}

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardLayout>
        <div>Conteúdo do dashboard</div>
      </DashboardLayout>
    </QueryClientProvider>,
  );
}

async function openLogoutPreview(user = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: /Carlos/i }));
  await user.click(await screen.findByRole("menuitem", { name: /Sair/i }));
  return screen.findByRole("dialog", { name: /Sair do sistema/i });
}

async function fillHandoff(user: ReturnType<typeof userEvent.setup>, message = "Cliente confirmou retorno da energia às 23h.") {
  const recipient = screen.getByRole("combobox", { name: /Próximo operador da conta ACCT-17/i });
  const observationUntil = screen.getByLabelText(/Observação até da conta ACCT-17/i);
  const note = screen.getByRole("textbox", { name: /Anotação de passagem da conta ACCT-17/i });

  await user.selectOptions(recipient, "2");
  fireEvent.change(observationUntil, { target: { value: "2099-12-31T23:59" } });
  await user.type(note, message);
}

describe("DashboardLayout — fluxo de passagem no logoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockState.previewData = previewWithPendingIncident();
    mockState.inboxData = [];
    mockState.remindersData = [];
    mockState.operatorNotices = [];
    mockState.inboxQueryResults.length = 0;
    mockState.remindersQueryResults.length = 0;
    mockState.dynamicQueryObjects = false;
    mockState.setLocation.mockReset();
    mockState.logout.mockResolvedValue(undefined);
    mockState.previewRefetch.mockResolvedValue(undefined);
    mockState.inboxRefetch.mockResolvedValue(undefined);
    mockState.remindersRefetch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("abre o preview de logoff e mantém pendências e anotações atuais visíveis", async () => {
    renderLayout();

    await openLogoutPreview();

    expect(await screen.findByText(/Conta ACCT-17 · atendimento #17/i)).toBeTruthy();
    expect(screen.getByText(/Cerca violada/i)).toBeTruthy();
    expect(screen.getByText(/Registro atual: Status inicial registrado pela central\./i)).toBeTruthy();
    expect(screen.getByText(/Anotação para o próximo operador/i)).toBeTruthy();
  });

  it("não chama logout quando a pendência está sem nota", async () => {
    const user = userEvent.setup();
    renderLayout();

    await openLogoutPreview(user);
    await user.click(screen.getByRole("button", { name: /Confirmar logoff/i }));

    expect(mockState.logout).not.toHaveBeenCalled();
    expect(await screen.findByText(/Cada ocorrência pendente precisa de um próximo operador e uma anotação de pelo menos 10 caracteres/i)).toBeTruthy();
  });

  it("chama logout com nota, destinatário e observationUntil futuros", async () => {
    const user = userEvent.setup();
    renderLayout();

    await openLogoutPreview(user);
    await fillHandoff(user);
    await user.click(screen.getByRole("button", { name: /Confirmar logoff/i }));

    await waitFor(() => expect(mockState.logout).toHaveBeenCalledTimes(1));
    expect(mockState.logout).toHaveBeenCalledWith([
      expect.objectContaining({
        incidentId: 17,
        toUserId: 2,
        message: "Cliente confirmou retorno da energia às 23h.",
        observationUntil: expect.any(Date),
      }),
    ]);
    expect(screen.queryByRole("dialog", { name: /Sair do sistema/i })).toBeNull();
  });

  it("mantém o diálogo e a nota quando logout rejeita", async () => {
    const user = userEvent.setup();
    const error = new Error("Sessão indisponível");
    mockState.logout.mockRejectedValueOnce(error);
    renderLayout();

    await openLogoutPreview(user);
    await fillHandoff(user, "Acompanhar retorno do cliente antes de encerrar o atendimento.");
    await user.click(screen.getByRole("button", { name: /Confirmar logoff/i }));

    expect(await screen.findByText("Sessão indisponível")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /Sair do sistema/i })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /Anotação de passagem da conta ACCT-17/i }) as HTMLTextAreaElement).value).toBe("Acompanhar retorno do cliente antes de encerrar o atendimento.");
    expect(mockState.previewRefetch).toHaveBeenCalled();
  });

  it("exibe o recado no login, permite VER AGORA e mantém-no visível até finalizar", async () => {
    mockState.inboxData = [{
      id: 31,
      fromOperatorName: "Amanda",
      toOperatorName: "Yasmin",
      account: "ACCT-31",
      incidentId: 31,
      incidentStatus: "observing",
      message: "Cliente confirmou o acesso do técnico amanhã cedo.",
      createdAt: "2026-11-04T17:00:00.000Z",
    }];
    const user = userEvent.setup();
    const rendered = renderLayout();

    expect(await screen.findByText("Mensagem de Amanda para Yasmin")).toBeTruthy();
    expect(screen.getAllByText("Cliente confirmou o acesso do técnico amanhã cedo.")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "VER AGORA" }));
    await waitFor(() => expect(mockState.setLocation).toHaveBeenCalledWith("/dashboard?incidentId=31"));
    expect(screen.queryByRole("dialog", { name: /mensagem de passagem/i })).toBeNull();
    expect(screen.getByRole("region", { name: "Mensagens de atendimentos pendentes" })).toBeTruthy();
    expect(screen.getByText("Cliente confirmou o acesso do técnico amanhã cedo.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Mensagens de atendimentos pendentes" }).className).not.toContain("fixed");
    rendered.unmount();
    renderLayout();
    expect(screen.queryByRole("dialog", { name: /mensagem de passagem/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Ver mensagens de atendimentos pendentes" })).toBeTruthy();
    mockState.inboxData = [];
    // O servidor remove do inbox quando fechado; o componente também remove o acesso.
    cleanup();
    renderLayout();
    expect(screen.queryByRole("region", { name: "Mensagens de atendimentos pendentes" })).toBeNull();
  });

  it.each([40, 20])("exibe o texto do reminder de término em %i minutos", async (minutesBefore) => {
    mockState.remindersData = [{
      reminder: {
        id: minutesBefore,
        minutesBefore,
        shiftEndsAt: "2099-12-31T23:59:00.000Z",
      },
    }];
    renderLayout();

    expect(await screen.findByText(`Passagem de turno · aviso de ${minutesBefore} minutos`)).toBeTruthy();
    expect(screen.getByText(/Finalize os atendimentos possíveis ou deixe cada ocorrência em observação com uma anotação para o próximo operador\./i)).toBeTruthy();
  });

  it("refaz inbox e reminders uma vez pelo notice sem loop quando os objetos de query mudam", async () => {
    mockState.dynamicQueryObjects = true;
    mockState.operatorNotices = [{
      kind: "shift_message",
      messageId: 31,
      userId: 1,
      fromOperatorName: "Amanda",
      toOperatorName: "Carlos",
      incidentId: 31,
      account: "ACCT-31",
    }];
    renderLayout();

    await waitFor(() => expect(mockState.inboxQueryResults.length).toBeGreaterThan(1));
    await waitFor(() => {
      const inboxRefetchCount = mockState.inboxQueryResults.reduce((count, refetch) => count + refetch.mock.calls.length, 0);
      const remindersRefetchCount = mockState.remindersQueryResults.reduce((count, refetch) => count + refetch.mock.calls.length, 0);
      expect(inboxRefetchCount).toBe(1);
      expect(remindersRefetchCount).toBe(0);
    });
  });
});
