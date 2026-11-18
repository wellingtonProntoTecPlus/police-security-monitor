// @vitest-environment jsdom
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardLayout from "./DashboardLayout";
import { buildRemoteCommandIncidentNotes, buildRemoteCommandRequestNote } from "../../../server/remoteCommandEventCorrelation";
const mockState = vi.hoisted(() => ({
  user: { id: 1, name: "Carlos", email: "carlos@example.com", role: "operator" },
  logout: vi.fn(),
  refresh: vi.fn(),
  operatorNotices: [] as unknown[],
  previewData: null as any,
  previewRefetchResult: null as any,
  inboxData: [] as any[],
  remindersData: [] as any[],
  previewRefetch: vi.fn(),
  inboxRefetch: vi.fn(),
  remindersRefetch: vi.fn(),
  inboxQueryResults: [] as Array<ReturnType<typeof vi.fn>>,
  remindersQueryResults: [] as Array<ReturnType<typeof vi.fn>>,
  dynamicQueryObjects: false,
  setLocation: vi.fn(),
  markRead: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockState.user, loading: false, error: null, refresh: mockState.refresh, logout: mockState.logout }),
}));
vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useSocket", () => ({
  useSocket: (_options?: unknown) => ({ connected: false, realtimeEvents: [], incidentUpdates: [], operatorNotices: mockState.operatorNotices, clearEvents: vi.fn() }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
  useLocation: () => ["/dashboard", mockState.setLocation],
}));
vi.mock("@/components/WorkspaceScreenMenu", () => ({ default: () => <button type="button">Outras telas</button> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false, error: null });
  return {
    trpc: {
      auth: { changeOwnPassword: { useMutation: mutation } },
      operatorShift: {
        loginScheduleDecision: { useQuery: () => ({ data: { required: false, scheduleStatus: "scheduled" }, isError: false, isFetching: false, error: null, refetch: vi.fn() }) },
        confirmLoginScheduleException: { useMutation: mutation },
        logoutPreview: { useQuery: () => ({
          data: mockState.previewData, dataUpdatedAt: 1, isLoading: false, isFetching: false, error: null,
          refetch: mockState.previewRefetch,
        }) },
        inbox: { useQuery: () => {
          const [, rerender] = useState(0);
          const refetch = mockState.dynamicQueryObjects ? vi.fn().mockImplementation(async () => { rerender((value) => value + 1); }) : mockState.inboxRefetch;
          mockState.inboxQueryResults.push(refetch);
          return { data: mockState.inboxData, isLoading: false, isFetching: false, error: null, refetch };
        } },
        pendingReminders: { useQuery: () => {
          const [, rerender] = useState(0);
          const refetch = mockState.dynamicQueryObjects ? vi.fn().mockImplementation(async () => { rerender((value) => value + 1); }) : mockState.remindersRefetch;
          mockState.remindersQueryResults.push(refetch);
          return { data: mockState.remindersData, isLoading: false, isFetching: false, error: null, refetch };
        } },
        markRead: { useMutation: () => ({ ...mutation(), mutateAsync: mockState.markRead }) },
        acknowledgeReminder: { useMutation: mutation },
        recipients: { useQuery: () => ({ data: [], error: null }) },
        messageGroups: { useQuery: () => ({ data: [], error: null, isLoading: false }) },
        sendMessage: { useMutation: mutation },
        sendGroupMessage: { useMutation: mutation },
      },
    },
  };
});
function previewWithPendingIncident() {
  return { pendingIncidents: [{
    incidentId: 17, account: "ACCT-17", description: "Cerca violada", eventCode: "130",
    status: "attending", notes: "Status inicial registrado pela central.", observationUntil: null,
    pauseReason: null, blockerReasons: ["Não há motivo operacional de pausa ou encaminhamento registrado."],
  }], nextOperators: [{ userId: 2, name: "Yasmin", shiftCode: "second" }], availableRecipients: [{ userId: 3, name: "Rafael", shiftCode: "third" }], fallbackRecipients: false };
}
function previewClear() {
  return { pendingIncidents: [], nextOperators: [], availableRecipients: [], fallbackRecipients: false };
}
function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><DashboardLayout><div>Conteúdo do dashboard</div></DashboardLayout></QueryClientProvider>);
}
async function openLogoutDialog(user = userEvent.setup(), item = "Sair") {
  await user.click(screen.getByRole("button", { name: /Carlos/i }));
  await user.click(await screen.findByRole("menuitem", { name: new RegExp(item, "i") }));
}
describe("DashboardLayout — logout seguro por preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockState.previewData = previewWithPendingIncident();
    mockState.previewRefetchResult = null;
    mockState.inboxData = [];
    mockState.remindersData = [];
    mockState.operatorNotices = [];
    mockState.inboxQueryResults.length = 0;
    mockState.remindersQueryResults.length = 0;
    mockState.dynamicQueryObjects = false;
    mockState.setLocation.mockReset();
    mockState.logout.mockResolvedValue(undefined);
    mockState.previewRefetch.mockImplementation(async () => ({ data: mockState.previewRefetchResult || mockState.previewData, error: null }));
    mockState.inboxRefetch.mockResolvedValue(undefined);
    mockState.remindersRefetch.mockResolvedValue(undefined);
  });
  afterEach(cleanup);
  it("atualiza preview e faz logout diretamente com handoffs vazios quando não há blockers", async () => {
    const user = userEvent.setup();
    mockState.previewData = previewClear();
    mockState.previewRefetchResult = previewClear();
    renderLayout();
    await openLogoutDialog(user);
    await waitFor(() => expect(mockState.logout).toHaveBeenCalledTimes(1));
    expect(mockState.previewRefetch).toHaveBeenCalledOnce();
    expect(mockState.logout).toHaveBeenCalledWith([]);
    expect(screen.queryByRole("dialog", { name: /Sair do sistema/i })).toBeNull();
  });
  it("mostra blockers informativos sem destinatário/mensagem e nunca chama logout", async () => {
    const user = userEvent.setup();
    renderLayout();
    await openLogoutDialog(user);
    const dialog = await screen.findByRole("dialog", { name: /Não é possível sair ainda/i });
    expect(mockState.previewRefetch).toHaveBeenCalledOnce();
    expect(screen.getByText(/Conta ACCT-17 · atendimento #17/i)).toBeTruthy();
    expect(screen.getByText("Não há motivo operacional de pausa ou encaminhamento registrado.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /Anotação de passagem/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Próximo operador/i })).toBeNull();
    expect(mockState.logout).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Voltar ao atendimento/i }));
    expect(mockState.logout).not.toHaveBeenCalled();
    expect(mockState.setLocation).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(dialog).toBeTruthy();
  });
  it("resume auditoria remota incompleta no diálogo de logoff sem ocultar a orientação humana", async () => {
    mockState.previewData = { ...previewWithPendingIncident(), pendingIncidents: [{ ...previewWithPendingIncident().pendingIncidents[0], notes: [
      "[COMANDO REMOTO #33 RESPOSTA KA4 RECEBIDA]",
      "Ação: Arme remoto via PoliceCentral",
      "Motivo: Teste antigo",
      "Resultado: resposta KA4 recebida; não confirma o estado final.",
      "Resposta da central: MB=KA4[4]",
      "MB=AK4[4]",
      "Observação humana: conferir com o cliente.",
    ].join("\n") + "\n" + buildRemoteCommandRequestNote({ commandId: 34, commandType: "disarm", operatorName: "Amanda", reason: "Cliente confirmou" }) + "\n" + buildRemoteCommandIncidentNotes({ commandId: 34, commandType: "disarm", commandLabel: "Desarme remoto", operatorName: "Amanda", reason: "Cliente confirmou", response: "MB=KA4" }) }] };
    const user = userEvent.setup();
    renderLayout();
    await openLogoutDialog(user);
    const summary = screen.getByText(/Registro atual:/).textContent || "";
    expect(summary).toContain("Comandos (2)");
    expect(summary).toContain("Desarme");
    expect(summary).toContain("Observação humana: conferir com o cliente.");
    expect(summary).not.toMatch(/COMANDO REMOTO|PoliceCentral|KA4|AK4|MB=|Auditoria do comando/);
  });
  it("aplica o mesmo preview-first para Trocar usuário e não sai com blocker", async () => {
    const user = userEvent.setup();
    renderLayout();
    await openLogoutDialog(user, "Trocar usuário");
    expect(await screen.findByRole("dialog", { name: /Não é possível trocar usuário ainda/i })).toBeTruthy();
    expect(mockState.previewRefetch).toHaveBeenCalledOnce();
    expect(mockState.logout).not.toHaveBeenCalled();
  });
  it("exibe o recado no login, permite VER AGORA e mantém-no visível até finalizar", async () => {
    mockState.inboxData = [{
      id: 31, fromOperatorName: "Amanda", toOperatorName: "Yasmin", account: "ACCT-31", incidentId: 31,
      incidentStatus: "observing", message: "Cliente confirmou o acesso do técnico amanhã cedo.", createdAt: "2026-11-04T17:00:00.000Z",
    }];
    const user = userEvent.setup();
    const rendered = renderLayout();
    expect(await screen.findByText("Mensagem de Amanda para Yasmin")).toBeTruthy();
    expect(screen.getAllByText("Cliente confirmou o acesso do técnico amanhã cedo.")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "VER AGORA" }));
    await waitFor(() => expect(mockState.setLocation).toHaveBeenCalledWith("/dashboard?incidentId=31"));
    expect(screen.queryByRole("dialog", { name: /mensagem de passagem/i })).toBeNull();
    expect(screen.getByRole("region", { name: "Notificações de mensagens pendentes" })).toBeTruthy();
    expect(screen.getByText("Cliente confirmou o acesso do técnico amanhã cedo.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Notificações de mensagens pendentes" }).className).not.toContain("fixed");
    rendered.unmount();
    renderLayout();
    expect(screen.queryByRole("dialog", { name: /mensagem de passagem/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Ver notificações de mensagens (1)" })).toBeTruthy();
    mockState.inboxData = [];
    cleanup();
    renderLayout();
    expect(screen.queryByRole("region", { name: "Notificações de mensagens pendentes" })).toBeNull();
  });

  it("usa o sino e identifica mensagens recebidas por grupo", async () => {
    mockState.inboxData = [{
      id: -71, deliveryId: 71, messageId: 91, messageType: "group", groupId: 8,
      groupName: "Operadoras da noite", fromOperatorName: "Amanda", toOperatorName: "Yasmin",
      incidentId: null, account: null, message: "Atenção para a troca de turno.", createdAt: "2026-11-18T20:00:00.000Z",
    }];
    renderLayout();
    expect(screen.getByRole("button", { name: "Ver notificações de mensagens (1)" })).toBeTruthy();
    expect(await screen.findByText("Mensagem de Amanda para o grupo Operadoras da noite")).toBeTruthy();
    expect(screen.getByText("Recado para a equipe")).toBeTruthy();
    expect(screen.getAllByText("Atenção para a troca de turno.")).toHaveLength(2);
    const bell = screen.getByRole("button", { name: "Ver notificações de mensagens (1)" }).querySelector("svg");
    expect(bell?.classList.contains("lucide-bell")).toBe(true);
    expect(bell?.classList.contains("shrink-0")).toBe(true);
    await userEvent.setup().click(screen.getByRole("button", { name: "Entendi" }));
    expect(mockState.markRead).toHaveBeenCalledWith({ messageId: 71, messageType: "group" });
  });

  it.each([40, 20])("exibe o texto do reminder de término em %i minutos", async (minutesBefore) => {
    mockState.remindersData = [{ reminder: { id: minutesBefore, minutesBefore, shiftEndsAt: "2099-12-31T23:59:00.000Z" } }];
    renderLayout();
    expect(await screen.findByText(`Passagem de turno · aviso de ${minutesBefore} minutos`)).toBeTruthy();
    expect(screen.getByText(/Finalize os atendimentos possíveis ou deixe cada ocorrência em observação com uma anotação para o próximo operador\./i)).toBeTruthy();
  });
  it("refaz inbox e reminders uma vez pelo notice sem loop quando os objetos de query mudam", async () => {
    mockState.dynamicQueryObjects = true;
    mockState.operatorNotices = [{ kind: "shift_message", messageId: 31, userId: 1, fromOperatorName: "Amanda", toOperatorName: "Carlos", incidentId: 31, account: "ACCT-31" }];
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
