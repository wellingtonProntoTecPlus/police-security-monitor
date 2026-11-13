import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { AlertTriangle, LayoutDashboard, LogOut, PanelLeft, Users, Building2, Shield, Camera, Settings, Radio, KeyRound, UserRound, X, CalendarClock, MessageSquareText, ExternalLink } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import WorkspaceScreenMenu from "./WorkspaceScreenMenu";
import OperatorHandoffMessageDialog from "./OperatorHandoffMessageDialog";
import { useSocket } from "@/hooks/useSocket";
import { OPERATOR_SHIFT_LABELS, type OperatorShiftCode } from "@shared/operatorShift";
import OperatorScheduleDecisionDialog from "./OperatorScheduleDecisionDialog";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Building2, label: "Empresa Gestora", path: "/managing-company" },
  { icon: Building2, label: "Empresa Parceira", path: "/partners" },
  { icon: Users, label: "Clientes", path: "/clients" },
  { icon: Shield, label: "Sistemas de Alarme", path: "/alarm-systems" },
  { icon: Radio, label: "Relatórios", path: "/reports" },
  { icon: CalendarClock, label: "Escalas e Presença", path: "/operator-shifts" },
  { icon: Shield, label: "Contact ID", path: "/contact-id" },
  { icon: LayoutDashboard, label: "Finalizações", path: "/finalizations" },
  { icon: Users, label: "Usuários", path: "/users" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

const ROLE_MENU_ITEMS: Record<string, string[]> = {
  admin: menuItems.map((item) => item.path),
  supervisor: ["/dashboard", "/partners", "/clients", "/reports", "/operator-shifts", "/contact-id", "/finalizations"],
  operator: ["/dashboard", "/clients", "/finalizations"],
  partner: ["/clients"],
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 200;
const MIN_WIDTH = 180;
const MAX_WIDTH = 360;
function localDateTimeInput(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }

export default function DashboardLayout({
  children,
  workspaceMenuPlacement = "global",
}: {
  children: React.ReactNode;
  workspaceMenuPlacement?: "global" | "page-header";
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user, error, refresh } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    if (error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-md space-y-4 text-center">
            <h1 className="text-xl font-semibold">Não foi possível conectar ao sistema.</h1>
            <p className="text-sm text-muted-foreground">Verifique sua internet e tente novamente.</p>
            <Button onClick={() => void refresh()} disabled={loading}>Tentar novamente</Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Entre para continuar
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              O acesso ao Police Central exige login com e-mail e senha.
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = "/login"; }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Entrar no sistema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth} workspaceMenuPlacement={workspaceMenuPlacement}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
  workspaceMenuPlacement: "global" | "page-header";
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  workspaceMenuPlacement,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [failedQueryCount, setFailedQueryCount] = useState(0);
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutMode, setLogoutMode] = useState<"logout" | "switch">("logout");
  const [handoffMessages, setHandoffMessages] = useState<Record<number, string>>({});
  const [handoffRecipients, setHandoffRecipients] = useState<Record<number, number>>({});
  const [handoffUntil, setHandoffUntil] = useState<Record<number, string>>({});
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [scheduleDecisionError, setScheduleDecisionError] = useState("");
  const [activeInboxMessageId, setActiveInboxMessageId] = useState<number | null>(null);
  const [handledInboxMessageIds, setHandledInboxMessageIds] = useState<Set<number>>(() => new Set());
  const [activeReminderId, setActiveReminderId] = useState<number | null>(null);
  const [noticeError, setNoticeError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const visibleMenuItems = user ? menuItems.filter((item) => (ROLE_MENU_ITEMS[user.role] || ROLE_MENU_ITEMS.operator).includes(item.path)) : menuItems;
  const changeOwnPasswordMut = trpc.auth.changeOwnPassword.useMutation();
  const isOperational = Boolean(user && ["admin", "supervisor", "operator"].includes(user.role));
  const needsScheduleCheck = user?.role === "operator";
  const scheduleDecision = trpc.operatorShift.loginScheduleDecision.useQuery(undefined, { enabled: needsScheduleCheck, retry: false, refetchOnWindowFocus: true });
  const scheduleConfirmed = !needsScheduleCheck || Boolean(scheduleDecision.data && !scheduleDecision.data.required && !scheduleDecision.isError);
  const logoutPreview = trpc.operatorShift.logoutPreview.useQuery(undefined, { enabled: logoutDialogOpen && isOperational && scheduleConfirmed, retry: false });
  const confirmScheduleDecision = trpc.operatorShift.confirmLoginScheduleException.useMutation();
  const inboxQuery = trpc.operatorShift.inbox.useQuery(undefined, {
    enabled: isOperational && scheduleConfirmed,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => query.state.data?.some((message) => Boolean(message.incidentId && message.incidentStatus && message.incidentStatus !== "closed")) ? 15_000 : false,
    retry: false,
  });
  const remindersQuery = trpc.operatorShift.pendingReminders.useQuery(undefined, { enabled: isOperational && scheduleConfirmed, refetchOnWindowFocus: true, retry: false });
  const { operatorNotices, incidentUpdates, connected: noticesConnected } = useSocket({ operationalNoticesOnly: true, incidentUpdatesOnly: true, enabled: isOperational && scheduleConfirmed });
  const noticeRefetchers = useRef({ inbox: inboxQuery.refetch, reminders: remindersQuery.refetch });
  noticeRefetchers.current = { inbox: inboxQuery.refetch, reminders: remindersQuery.refetch };
  const markMessageRead = trpc.operatorShift.markRead.useMutation({ onSuccess: async () => { await inboxQuery.refetch(); } });
  const acknowledgeReminder = trpc.operatorShift.acknowledgeReminder.useMutation({ onSuccess: async () => { await remindersQuery.refetch(); } });
  const messageSeenKey = (message: { id: number; notificationSessionId?: number | null }) => `policecentral:handoff:${user?.id}:${message.notificationSessionId ?? "local"}:${message.id}`;
  const recordMessageSeen = (id: number) => {
    const message = inboxQuery.data?.find((item) => Number(item.id) === id);
    if (message) { try { sessionStorage.setItem(messageSeenKey(message), "seen"); } catch { /* Storage indisponível: mantém controle em memória. */ } }
    setHandledInboxMessageIds((previous) => new Set(previous).add(id));
    setActiveInboxMessageId(null);
  };
  const confirmMessageRead = async (id: number) => {
    setNoticeError("");
    try { await markMessageRead.mutateAsync({ messageId: id }); recordMessageSeen(id); }
    catch (error) { setNoticeError(error instanceof Error ? error.message : "Não foi possível registrar a leitura. Tente novamente."); }
  };
  const viewIncidentMessage = async (id: number, incidentId: number) => {
    setNoticeError("");
    try {
      await markMessageRead.mutateAsync({ messageId: id });
      recordMessageSeen(id);
      setLocation(`/dashboard?incidentId=${incidentId}`);
    } catch (error) { setNoticeError(error instanceof Error ? error.message : "Não foi possível abrir o atendimento. Tente novamente."); }
  };
  const confirmReminderRead = async (id: number) => {
    setNoticeError("");
    try { await acknowledgeReminder.mutateAsync({ reminderId: id }); setActiveReminderId(null); }
    catch (error) { setNoticeError(error instanceof Error ? error.message : "Não foi possível confirmar o aviso. Tente novamente."); }
  };

  const chooseScheduleDecision = async (reason: "scale_swap" | "double_shift" | "vacation_coverage") => {
    setScheduleDecisionError("");
    try {
      await confirmScheduleDecision.mutateAsync({ reason });
      await scheduleDecision.refetch();
    } catch (error) {
      setScheduleDecisionError(error instanceof Error ? error.message : "Não foi possível gravar a justificativa. Tente novamente.");
    }
  };

  useEffect(() => {
    if (operatorNotices?.some((notice) => notice.kind === "shift_message")) void noticeRefetchers.current.inbox();
    if (operatorNotices?.some((notice) => notice.kind === "shift_reminder")) void noticeRefetchers.current.reminders();
  }, [operatorNotices]);

  useEffect(() => {
    if (incidentUpdates?.[0]) void noticeRefetchers.current.inbox();
  }, [incidentUpdates]);

  useEffect(() => {
    if (noticesConnected) { void noticeRefetchers.current.inbox(); void noticeRefetchers.current.reminders(); }
  }, [noticesConnected]);

  useEffect(() => {
    if (!scheduleConfirmed) return;
    if (activeInboxMessageId !== null && inboxQuery.data && !inboxQuery.data.some((message) => Number(message.id) === activeInboxMessageId)) {
      setActiveInboxMessageId(null);
      return;
    }
    const first = inboxQuery.data?.find((message) => {
      if (handledInboxMessageIds.has(Number(message.id))) return false;
      try { return sessionStorage.getItem(messageSeenKey(message)) !== "seen"; } catch { return true; }
    });
    if (first && activeInboxMessageId === null) setActiveInboxMessageId(Number(first.id));
  }, [inboxQuery.data, activeInboxMessageId, handledInboxMessageIds, scheduleConfirmed, user?.id]);

  useEffect(() => {
    const first = remindersQuery.data?.[0]?.reminder;
    if (first && activeReminderId === null) setActiveReminderId(Number(first.id));
  }, [remindersQuery.data, activeReminderId]);

  useEffect(() => {
    if (!logoutDialogOpen || !logoutPreview.data) return;
    setHandoffMessages((old) => Object.fromEntries(logoutPreview.data.pendingIncidents.map((incident) => [incident.incidentId, old[incident.incidentId] || ""])));
    setHandoffRecipients((old) => Object.fromEntries(logoutPreview.data.pendingIncidents.map((incident) => [incident.incidentId, old[incident.incidentId] || logoutPreview.data.nextOperators[0]?.userId || logoutPreview.data.availableRecipients[0]?.userId || 0])));
    setHandoffUntil((old) => Object.fromEntries(logoutPreview.data.pendingIncidents.map((incident) => [incident.incidentId, old[incident.incidentId] || localDateTimeInput(incident.observationUntil && new Date(incident.observationUntil) > new Date() ? new Date(incident.observationUntil) : new Date(Date.now() + 30 * 60_000))])));
  }, [logoutDialogOpen, logoutPreview.dataUpdatedAt]);

  const changeShift = () => { setLogoutMode("switch"); setLogoutError(""); setLogoutDialogOpen(true); };
  const requestLogout = () => { setLogoutMode("logout"); setLogoutError(""); setLogoutDialogOpen(true); };

  const confirmLogout = async () => {
    if (logoutSubmitting) return;
    const incidents = logoutPreview.data?.pendingIncidents || [];
    const handoffs = incidents.map((incident) => ({
      incidentId: incident.incidentId,
      toUserId: handoffRecipients[incident.incidentId] || 0,
      message: handoffMessages[incident.incidentId] || "",
      observationUntil: new Date(handoffUntil[incident.incidentId] || ""),
    }));
    if (handoffs.some((handoff) => !handoff.toUserId || handoff.message.trim().length < 10)) {
      setLogoutError("Cada ocorrência pendente precisa de um próximo operador e uma anotação de pelo menos 10 caracteres.");
      return;
    }
    if (handoffs.some((handoff) => Number.isNaN(handoff.observationUntil.getTime()) || handoff.observationUntil <= new Date())) { setLogoutError("Informe prazo futuro de observação para cada ocorrência."); return; }
    setLogoutSubmitting(true);
    try {
      await logout(handoffs);
      setLogoutDialogOpen(false);
      if (logoutMode === "switch") window.location.href = "/login?turno=1";
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Não foi possível concluir o logoff. Nenhuma ocorrência foi transferida.");
      await logoutPreview.refetch();
    } finally {
      setLogoutSubmitting(false);
    }
  };

  useEffect(() => {
    const updateFailedQueryCount = () => {
      const count = queryClient.getQueryCache().getAll().filter(
        (query) => query.state.status === "error" && query.getObserversCount() > 0,
      ).length;
      setFailedQueryCount(count);
    };
    updateFailedQueryCount();
    return queryClient.getQueryCache().subscribe(updateFailedQueryCount);
  }, [queryClient]);

  const retryFailedQueries = async () => {
    await queryClient.refetchQueries({
      predicate: (query) => query.state.status === "error" && query.getObserversCount() > 0,
    });
  };

  const saveOwnPassword = async () => {
    if (newPassword !== confirmPassword) {
      window.alert("A confirmação da nova senha não confere.");
      return;
    }
    try {
      await changeOwnPasswordMut.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setProfileOpen(false);
      window.alert("Senha alterada com sucesso.");
    } catch (error: any) {
      window.alert(error?.message || "Não foi possível alterar a senha.");
    }
  };

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate font-semibold tracking-tight">
                    Police Central
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {visibleMenuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                      className="h-10 transition-all font-normal"
                    >
                      <Link href={item.path}>
                        <item.icon
                          className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            {scheduleConfirmed && inboxQuery.data?.some((message) => message.incidentId && message.incidentStatus && message.incidentStatus !== "closed") && (
              <section aria-label="Mensagens de atendimentos pendentes" className="mb-2 rounded-lg border border-amber-500/50 bg-amber-500/10 text-card-foreground">
                <button type="button" aria-label="Ver mensagens de atendimentos pendentes" title="Mensagens de atendimentos pendentes: disponíveis até finalizar" className="flex min-h-10 w-full items-center justify-center gap-2 px-2 py-2 text-sm font-semibold text-amber-300" onClick={() => {
                  const message = inboxQuery.data?.find((item) => Boolean(item.incidentId && item.incidentStatus && item.incidentStatus !== "closed"));
                  if (message) { setNoticeError(""); setActiveInboxMessageId(Number(message.id)); }
                }}>
                  <MessageSquareText className="h-4 w-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">Mensagens</span>
                  <span className="rounded bg-amber-500/25 px-1 text-xs">{inboxQuery.data.filter((message) => message.incidentId && message.incidentStatus && message.incidentStatus !== "closed").length}</span>
                </button>
                <div className="max-h-[25vh] space-y-2 overflow-y-auto p-2 pt-0 group-data-[collapsible=icon]:hidden">
                  {inboxQuery.data.filter((message) => message.incidentId && message.incidentStatus && message.incidentStatus !== "closed").map((message) => (
                    <article key={message.id} className="rounded-md bg-background/70 p-2">
                      <p className="text-xs font-semibold">{message.fromOperatorName} → {message.toOperatorName} · Conta {message.account || "—"} · #{message.incidentId}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs">{message.message}</p>
                      <Button size="sm" variant="outline" className="mt-2 h-8 gap-1.5 border-amber-500/50 text-amber-200" onClick={() => setLocation(`/dashboard?incidentId=${message.incidentId}`)}><ExternalLink className="h-3.5 w-3.5" /> Abrir atendimento</Button>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {failedQueryCount > 0 && (
              <div role="alert" aria-live="polite" className="mb-2 overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/10">
                <button
                  type="button"
                  title="Alguns dados não foram atualizados. Verifique sua conexão. Clique para tentar novamente."
                  aria-label="Alguns dados não foram atualizados. Verifique sua conexão e clique para tentar novamente."
                  onClick={() => void retryFailedQueries()}
                  className="flex min-h-10 w-full items-center gap-2 px-2 py-2 text-left text-amber-200 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 group-data-[collapsible=icon]:justify-center"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="min-w-0 text-xs leading-snug group-data-[collapsible=icon]:hidden">
                    Alguns dados não foram atualizados. Verifique a conexão e clique para tentar novamente.
                  </span>
                </button>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-11 w-11 border-2 border-primary/60 shadow-md shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" className="w-64">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-1">{user?.email}</p>
                  <p className="text-xs text-primary mt-1 capitalize">Perfil: {user?.role}</p>
                </div>
                <DropdownMenuItem onClick={() => setProfileOpen(true)} className="cursor-pointer">
                  <UserRound className="mr-2 h-4 w-4" />
                  <span>Meu perfil e senha</span>
                </DropdownMenuItem>
                {isOperational && <DropdownMenuItem onClick={() => setMessageDialogOpen(true)} className="cursor-pointer"><Users className="mr-2 h-4 w-4" /><span>Mensagem de passagem</span></DropdownMenuItem>}
                <DropdownMenuItem onClick={() => void changeShift()} className="cursor-pointer text-amber-600 focus:text-amber-700">
                  <Users className="mr-2 h-4 w-4" />
                  <span>Trocar usuário</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={requestLogout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        {profileOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="font-semibold">Perfil do operador</h2>
                  <p className="text-xs text-muted-foreground mt-1">{user?.name} · {user?.email}</p>
                </div>
                <button onClick={() => setProfileOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar perfil"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p><span className="text-muted-foreground">Função:</span> <span className="capitalize font-medium">{user?.role}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">Use a troca de usuário ao encerrar o turno. A tela volta ao login e as ocorrências abertas permanecem na fila.</p>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Alterar senha</p>
                  <div className="space-y-3">
                    <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Senha atual" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nova senha (mínimo 6 caracteres)" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar nova senha" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                <Button variant="outline" onClick={() => setProfileOpen(false)}>Cancelar</Button>
                <Button onClick={() => void saveOwnPassword()} disabled={changeOwnPasswordMut.isPending}>{changeOwnPasswordMut.isPending ? "Salvando..." : "Salvar senha"}</Button>
              </div>
            </div>
          </div>
        )}
        {messageDialogOpen && <OperatorHandoffMessageDialog onClose={() => setMessageDialogOpen(false)} />}
        {logoutDialogOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="operator-logout-title">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
              <div className="border-b border-border px-5 py-4">
                <h2 id="operator-logout-title" className="text-lg font-semibold">{logoutMode === "switch" ? "Trocar usuário" : "Sair do sistema"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Antes do logoff, confira e passe para o próximo operador todas as ocorrências que ainda estão atribuídas a você.</p>
              </div>
              <div className="space-y-4 p-5">
                {logoutPreview.isLoading ? <p className="text-sm text-muted-foreground">Conferindo suas ocorrências abertas...</p> : null}
                {logoutPreview.error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{logoutPreview.error.message}</p> : null}
                {logoutPreview.data?.fallbackRecipients && logoutPreview.data.pendingIncidents.length > 0 ? <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">Não há operador escalado para o próximo turno. Selecione um operador disponível abaixo e informe o motivo.</p> : null}
                {logoutPreview.data?.pendingIncidents.length === 0 && !logoutPreview.isLoading && !logoutPreview.error ? <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">Nenhuma ocorrência pendente está atribuída a você. Pode confirmar o logoff.</p> : null}
                {logoutPreview.data?.pendingIncidents.map((incident) => {
                  const recipients = logoutPreview.data.nextOperators.length ? logoutPreview.data.nextOperators : logoutPreview.data.availableRecipients;
                  return <div key={incident.incidentId} className="space-y-3 rounded-lg border border-border p-4">
                    <div>
                      <p className="font-semibold">Conta {incident.account} · atendimento #{incident.incidentId}</p>
                      <p className="text-sm text-muted-foreground">{incident.description || `Evento ${incident.eventCode}`} · {incident.status === "observing" ? "já está em observação" : "precisa ser colocado em observação"}</p>
                      {incident.notes ? <p className="mt-2 whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">Registro atual: {incident.notes}</p> : null}
                    </div>
                    <label className="block text-xs text-muted-foreground">Observação até
                      <input type="datetime-local" aria-label={`Observação até da conta ${incident.account}`} value={handoffUntil[incident.incidentId] || ""} onChange={(event) => setHandoffUntil((old) => ({ ...old, [incident.incidentId]: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1 text-xs text-muted-foreground">Próximo operador
                        <select aria-label={`Próximo operador da conta ${incident.account}`} value={handoffRecipients[incident.incidentId] || ""} onChange={(event) => setHandoffRecipients((previous) => ({ ...previous, [incident.incidentId]: Number(event.target.value) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                          <option value="">Selecione</option>
                          {recipients.map((person: any) => <option key={person.userId} value={person.userId}>{person.name}{person.shiftCode ? ` · ${OPERATOR_SHIFT_LABELS[person.shiftCode as OperatorShiftCode]}` : ""}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">Anotação para o próximo operador (mínimo 10 caracteres)
                        <textarea aria-label={`Anotação de passagem da conta ${incident.account}`} value={handoffMessages[incident.incidentId] || ""} onChange={(event) => setHandoffMessages((previous) => ({ ...previous, [incident.incidentId]: event.target.value }))} rows={3} maxLength={4000} placeholder="Ex.: Cliente informou que está sem energia; previsão de retorno às 13h." className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground" />
                      </label>
                    </div>
                  </div>;
                })}
                {logoutError ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{logoutError}</p> : null}
                <p className="text-xs text-muted-foreground">O sistema grava quem saiu, o horário, o destinatário e a mensagem. As ocorrências continuam na fila, agora em observação. Se houver pendências, nenhuma delas é alterada se uma anotação ou destinatário estiver faltando.</p>
              </div>
              <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                <Button variant="outline" disabled={logoutSubmitting} onClick={() => setLogoutDialogOpen(false)}>Cancelar</Button>
                <Button onClick={() => void confirmLogout()} disabled={logoutSubmitting || logoutPreview.isFetching || Boolean(logoutPreview.error)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{logoutSubmitting ? "Registrando..." : "Confirmar logoff"}</Button>
              </div>
            </div>
          </div>
        )}
        {scheduleConfirmed && activeInboxMessageId !== null && inboxQuery.data?.some((message) => Number(message.id) === activeInboxMessageId) && (() => {
          const message = inboxQuery.data.find((entry) => Number(entry.id) === activeInboxMessageId)!;
          return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Mensagem de passagem de turno">
            <div className="w-full max-w-lg rounded-xl border border-primary/40 bg-card p-5 text-card-foreground shadow-2xl">
              <p className="text-lg font-semibold">Mensagem de {message.fromOperatorName} para {message.toOperatorName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{message.account ? `Conta ${message.account}` : "Recado de passagem"}{message.incidentId ? ` · atendimento #${message.incidentId}` : ""}</p>
              <p className="my-4 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{message.message}</p>
              <p className="text-xs text-muted-foreground">Recebida em {new Date(message.createdAt).toLocaleString("pt-BR")}</p>
              {noticeError ? <p role="alert" className="mt-2 text-sm text-destructive">{noticeError}</p> : null}
              <div className="mt-4 flex justify-end gap-2">
                {message.incidentId && message.incidentStatus && message.incidentStatus !== "closed"
                  ? <Button disabled={markMessageRead.isPending} onClick={() => { void viewIncidentMessage(Number(message.id), Number(message.incidentId)); }}>VER AGORA</Button>
                  : <Button disabled={markMessageRead.isPending} onClick={() => { void confirmMessageRead(Number(message.id)); }}>Entendi</Button>}
              </div>
            </div>
          </div>;
        })()}
        {activeReminderId !== null && remindersQuery.data?.some((row) => Number(row.reminder.id) === activeReminderId) && (() => {
          const reminder = remindersQuery.data.find((row) => Number(row.reminder.id) === activeReminderId)!.reminder;
          return <div className="fixed inset-0 z-[94] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Aviso de término de turno">
            <div className="w-full max-w-md rounded-xl border border-amber-500/50 bg-card p-5 text-card-foreground shadow-2xl">
              <p className="text-lg font-semibold">Passagem de turno · aviso de {reminder.minutesBefore} minutos</p>
              <p className="mt-2 text-sm text-muted-foreground">Turno termina às {new Date(reminder.shiftEndsAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}. Finalize os atendimentos possíveis ou deixe cada ocorrência em observação com uma anotação para o próximo operador.</p>
              {noticeError ? <p role="alert" className="mt-2 text-sm text-destructive">{noticeError}</p> : null}
              <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setMessageDialogOpen(true)}>Escrever passagem</Button><Button disabled={acknowledgeReminder.isPending} onClick={() => { void confirmReminderRead(Number(reminder.id)); }}>Entendi</Button></div>
            </div>
          </div>;
        })()}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        {workspaceMenuPlacement === "global" && (
          <div className="flex h-12 shrink-0 items-center justify-end border-b border-primary/25 bg-card px-4">
            <WorkspaceScreenMenu
              label="Outras telas"
              className="border-primary/60 bg-primary/10 font-semibold text-primary shadow-sm hover:bg-primary/20"
            />
          </div>
        )}
        <main className={`min-h-0 flex-1 overflow-hidden ${workspaceMenuPlacement === "global" ? "h-[calc(100dvh-6.5rem)] md:h-[calc(100dvh-3rem)]" : "h-[calc(100dvh-3.5rem)] md:h-[100dvh]"}`}>{scheduleConfirmed ? children : <div role="status" className="p-5 text-sm text-muted-foreground">Conferindo sua escala de trabalho...</div>}</main>
      </SidebarInset>
      {needsScheduleCheck && <OperatorScheduleDecisionDialog
        open={scheduleDecision.isError || scheduleDecision.data?.required === true}
        operatorName={user?.name || "Operador"}
        isError={scheduleDecision.isError}
        errorMessage={scheduleDecision.error?.message || ""}
        isRetrying={scheduleDecision.isFetching}
        isSubmitting={confirmScheduleDecision.isPending}
        submitError={scheduleDecisionError}
        onRetry={() => { void scheduleDecision.refetch(); }}
        onChoose={(reason) => { void chooseScheduleDecision(reason); }}
      />}
    </>
  );
}
