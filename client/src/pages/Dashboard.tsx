import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import QuickScheduleExceptionDialog from "@/components/QuickScheduleExceptionDialog";
import CompatecZoneConfigurationPanel from "@/components/CompatecZoneConfigurationPanel";
import CompatecCommandReconciliationPanel from "@/components/CompatecCommandReconciliationPanel";
import { getCompatecArmAuditReason, getCompatecArmAuthorizationOptions, type CompatecArmAuthorizationBasis } from "@shared/compatecArmAuthorization";
import { isManualCompatecNonApplication } from "@shared/compatecCommandReconciliation";
import OperationalProcedurePanel from "@/components/OperationalProcedurePanel";
import RecentClientEventsPanel from "@/components/RecentClientEventsPanel";
import IncidentAuditTimeline from "@/components/IncidentAuditTimeline";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSocket, AlarmEvent } from "@/hooks/useSocket";
import {
  Bell, Phone, PhoneCall, Shield, Camera, FileText, Truck, X, Search,
  CheckCircle2, Ban, AlertTriangle, Users, Eye, Wrench, ChevronLeft,
  ChevronRight, Clock, Wifi, WifiOff, Send, Mail, Plus, MapPin, Maximize2,
  LogOut, Volume2, VolumeX, CarFront, Headphones, CalendarClock, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import HLSPlayer from "@/components/HLSPlayer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isVetti24HourZone } from "@shared/vettiZoneRules";
import { formatContactIdArgument } from "@shared/contactIdArgumentContext";
import { resolveQueueEventClient, resolveQueueEventSystem } from "@/lib/queueEventIdentity";
import { resolveRemoteCommandIdentity } from "@/lib/remoteCommandIdentity";
import WorkspaceScreenMenu from "@/components/WorkspaceScreenMenu";
import { getQuickFinalizationOptions } from "@/lib/quickFinalizationSearch";
import { shouldConfirmAttendanceNavigation } from "@/lib/attendanceExitGuard";
import { matchesOperationalStatusSearch } from "@/lib/operationalStatusSearch";
import { getOperatorFacingIncidentNotes } from "@/lib/operatorFacingIncidentNotes";
import { getEffectiveClientMonitoringStatus } from "@shared/clientMonitoringStatus";
import { INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE, INTELBRAS_PHYSICAL_COMMAND_ENABLED } from "@shared/remoteCommandCredentialProfiles";
import { getBulkFinalizationFeedback } from "@shared/incidentBulkFinalization";
import { createIncidentAuditRequestId } from "@shared/incidentAudit";
import { isConfirmedBulkSetEligible } from "@shared/bulkIncidentSummary";
import { useSearch, useLocation } from "wouter";

type QueueStatus = "waiting" | "attending" | "observing" | "tactical" | "maintenance";
type RemoteCommandType = "arm" | "disarm" | "isolate_zone" | "restore_zone" | "activate_pgm";
type RemoteCommandHistoryType = RemoteCommandType | "configure_zones" | "query_status" | "enable_bench_mode" | "disable_bench_mode";

const REMOTE_COMMAND_LABELS: Record<RemoteCommandType, string> = {
  arm: "Armar central",
  disarm: "Desarmar central",
  isolate_zone: "Isolar zona",
  restore_zone: "Restaurar zona",
  activate_pgm: "Acionar PGM",
};
const REMOTE_COMMAND_HISTORY_LABELS: Record<RemoteCommandHistoryType, string> = {
  ...REMOTE_COMMAND_LABELS,
  configure_zones: "Configuração de setores (AK2→AK1)",
  query_status: "Consultar status da central",
  enable_bench_mode: "Habilitar bancada AMT-8000",
  disable_bench_mode: "Desabilitar bancada AMT-8000",
};
const REMOTE_COMMAND_STATUS_LABELS: Record<string, string> = {
  simulated: "Simulado",
  queued: "Reservado",
  waiting_connection: "Aguardando conexão",
  dispatching: "Despacho em andamento",
  dispatch_unknown: "Resultado indeterminado · conferir central",
  sent: "Enviado · aguardando central",
  responded: "Confirmado pela central",
  authorized: "Autorizado · sem transmissão",
  disabled: "Desativado · sem transmissão",
  failed: "Falhou · não confirmado",
  reconciled: "Conferido manualmente · sem confirmação eletrônica",
  finalization_failed: "Ação confirmada · liberação falhou",
  expired: "Expirou sem transmissão",
  cancelled: "Cancelado · consulte auditoria",
};
function getRemoteCommandHistoryStatusLabel(command: any) {
  if (command.status === "cancelled" && isManualCompatecNonApplication(command.responsePayload)) {
    return "Cancelado após conferência · não aplicado";
  }
  if (command.status === "responded" && command.transportMode === "microbus_compatec"
    && (command.commandType === "arm" || command.commandType === "disarm")
    && /(?:^|\n)MB=KA4(?:\[[^\]\r\n]*\])?\r?$/m.test(command.responsePayload || "")) {
    return "Resposta KA4 recebida · estado final não confirmado";
  }
  if (command.status === "responded" && (command.commandType === "isolate_zone" || command.commandType === "restore_zone")) {
    return "Resposta KA1 recebida · bypass não confirmado";
  }
  if (command.status === "responded" && command.commandType === "configure_zones") {
    return "Resposta KA1 recebida · estados finais dos setores não confirmados";
  }
  return REMOTE_COMMAND_STATUS_LABELS[command.status] || command.status;
}
function isStandalonePhysicalCommandSupported(brand?: string | null) {
  const normalized = String(brand || "").trim().toUpperCase();
  return normalized === "COMPATEC";
}
interface QueueEvent extends AlarmEvent {
  receivedAt?: string;
  incidentId?: number;
  parentIncidentId?: number | null;
  incidentOperatorId?: number | null;
  incidentOperatorName?: string | null;
  panelActive?: boolean;
  panelOperatorId?: number | null;
  panelOperatorName?: string | null;
  panelLeaseExpiresAt?: string | Date | null;
  pauseReason?: string | null;
  incidentVersion?: number;
  incidentClientId?: number | null;
  incidentSystemId?: number | null;
  incidentNotes?: string | null;
  queueStatus: QueueStatus;
  queuedAt: number;
  observationUntil?: string | Date | null;
  clientName?: string;
  systemModel?: string;
  zoneName?: string;
}

const PANEL_USER_EVENT_CODES = new Set(["401", "407"]);

function isPanelUserEvent(event?: Pick<AlarmEvent, "eventCode"> | null) {
  return Boolean(event && PANEL_USER_EVENT_CODES.has(event.eventCode));
}

function isPanelUserDisplayEvent(event?: Pick<AlarmEvent, "eventCode"> | null) {
  return Boolean(event && (isPanelUserEvent(event) || event.eventCode === "701"));
}

function isUnidentifiedApplicationUserEvent(event?: Pick<AlarmEvent, "eventCode" | "zoneUser"> | null) {
  return Boolean(event?.eventCode === "701" && Number(event.zoneUser || 0) === 0);
}

function getPanelUserDisplayText(
  event?: Pick<AlarmEvent, "eventCode" | "zoneUser"> | null,
  panelUser?: { name?: string | null } | null,
) {
  if (!isPanelUserDisplayEvent(event)) return null;
  if (isUnidentifiedApplicationUserEvent(event)) return "Usuário do painel: não informado";
  return `Usuário da central: ${String(event?.zoneUser || "").padStart(2, "0")} · ${panelUser?.name || "Não cadastrado"}`;
}

// Modal de câmera expandida
function CameraModal({ cam, onClose, url, label }: { cam: number; onClose: () => void; url?: string; label?: string }) {
  return (
    <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center" onClick={onClose}>
      <div className="relative w-[80vw] h-[70vh] bg-black border border-border rounded-lg flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-white hover:text-red-400 z-10">
          <X className="h-6 w-6" />
        </button>
        {url ? (
          <HLSPlayer url={url} label={label || `Câmera ${cam}`} className="w-full h-full" />
        ) : (
          <div className="text-center">
            <Camera className="h-16 w-16 mx-auto text-muted-foreground mb-3" />
            <span className="text-white text-xl font-bold">{label || `Câmera ${cam}`}</span>
            <p className="text-muted-foreground text-sm mt-2">Configure a URL HLS para visualizar o stream ao vivo</p>
            <p className="text-muted-foreground text-xs mt-1">O proxy RTSP→HLS precisa estar ativo no servidor</p>
          </div>
        )}
      </div>
    </div>
  );
}

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  critical: { label: "Crítica", color: "bg-red-600 text-white" },
  high: { label: "Alta", color: "bg-yellow-500 text-black" },
  medium: { label: "Média", color: "bg-blue-500 text-white" },
  low: { label: "Baixa", color: "bg-green-600 text-white" },
};

const PRIORITY_TEXT_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high: "text-yellow-400",
  medium: "text-blue-400",
  low: "text-green-400",
};

const PRIORITY_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-yellow-500",
  medium: "border-l-blue-500",
  low: "border-l-green-500",
};

const EMPTY_QUEUE: any[] = [];
const EMPTY_CONNECTION_SYSTEMS: any[] = [];

function dateTimeLocalValue(date: Date) {
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function getRemoteCommandFrames(commandPayload?: string | null) {
  try {
    const parsed = JSON.parse(commandPayload || "{}");
    return Array.isArray(parsed.frames) ? parsed.frames.filter((frame: unknown) => typeof frame === "string") : [];
  } catch {
    return [];
  }
}

function getRemoteProtocolMode(commandPayload?: string | null) {
  try {
    const parsed = JSON.parse(commandPayload || "{}");
    if (parsed.mode === "physical") return "physical";
    if (parsed.mode === "physical_zone_configuration") return "physical_zone_configuration";
    return "simulation";
  } catch {
    return "simulation";
  }
}

function getRemoteCommandFrameLabel(command: { commandPayload?: string | null; status?: string }) {
  const mode = getRemoteProtocolMode(command.commandPayload);
  if (mode === "physical_zone_configuration") {
    if (command.status === "dispatch_unknown") return "Quadros AK2→AK1 podem ter sido transmitidos · resultado indeterminado";
    if (command.status === "reconciled") return "Quadros AK2→AK1 · resultado conferido manualmente, sem confirmação eletrônica";
    if (["sent", "responded"].includes(command.status || "")) return "Quadros físicos AK2→AK1 · transmissão registrada; KA1 não confirma estado final";
    return "Quadros físicos AK2→AK1 previstos · transmissão não confirmada";
  }
  return mode === "physical" ? "Quadro físico (senha não armazenada)" : "Quadro simulado";
}

function incidentStatusToQueueStatus(status?: string): QueueStatus {
  if (status === "attending") return "attending";
  if (status === "observing") return "observing";
  if (status === "dispatched") return "tactical";
  if (status === "maintenance") return "maintenance";
  return "waiting";
}

function queueStatusToIncidentStatus(status: QueueStatus) {
  if (status === "tactical") return "dispatched" as const;
  if (status === "maintenance") return "maintenance" as const;
  return status as "waiting" | "attending" | "observing";
}

function isSameBulkScope(item: QueueEvent, selected: QueueEvent) {
  const selectedSystemId = selected.alarmSystemId ?? selected.incidentSystemId;
  const itemSystemId = item.alarmSystemId ?? item.incidentSystemId;
  return item.account === selected.account
    && (!selectedSystemId || itemSystemId === selectedSystemId);
}

// Cronômetro
function Timer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  return (
    <span className="font-mono text-lg font-bold text-green-400 bg-green-500/10 border border-green-500/30 px-3 py-1 rounded">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [queues, setQueues] = useState<QueueEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<QueueEvent | null>(null);
  const selectedEventRef = useRef<QueueEvent | null>(selectedEvent);
  // Lease de painel vive somente em memória. Não copiar o token para a fila nem para o storage.
  const [panelLease, setPanelLease] = useState<{ incidentId: number; leaseToken: string; leaseExpiresAt?: string | Date | null } | null>(null);
  const panelLeaseRef = useRef<typeof panelLease>(null);
  const [leaseBlocked, setLeaseBlocked] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [assumeAvailable, setAssumeAvailable] = useState(false);
  const [panelWarning, setPanelWarning] = useState("");
  const [openPending, setOpenPending] = useState(false);
  const openingIncidentRef = useRef<number | null>(null);
  const [pausePanelOpen, setPausePanelOpen] = useState(false);
  const [pausePanelReason, setPausePanelReason] = useState("");
  const [tacticalReasonOpen, setTacticalReasonOpen] = useState(false);
  const [tacticalReason, setTacticalReason] = useState("");
  const pendingSelectionRef = useRef<QueueEvent | null>(null);
  const pendingNavigationRef = useRef<string | null>(null);
  const panelTransitionInFlightRef = useRef(false);
  const [panelTransitionBusy, setPanelTransitionBusy] = useState(false);
  const finalizationInFlightRef = useRef(false);
  const [attendingNotes, setAttendingNotes] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"cameras" | "contacts" | "zones">("cameras");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processedIds = useRef<Set<string>>(new Set());
  const [attendStartTime, setAttendStartTime] = useState<number>(0);
  const [expandedCam, setExpandedCam] = useState<number | null>(null);
  const [camPage, setCamPage] = useState(0);
  const totalCams = 16; // máximo de câmeras por cliente
  const camsPerPage = 4;
  const [sendEmail, setSendEmail] = useState(false);
  const [sendPush, setSendPush] = useState(false);
  const [armDisarmModal, setArmDisarmModal] = useState<'armed' | 'disarmed' | null>(null);
  const [quickScheduleSystem, setQuickScheduleSystem] = useState<any | null>(null);
  const [scheduleAlertsModal, setScheduleAlertsModal] = useState(false);
  const [standaloneRemoteRequest, setStandaloneRemoteRequest] = useState<(any & { commandType: "arm" | "disarm" }) | null>(null);
  const [standaloneRemoteReason, setStandaloneRemoteReason] = useState("");
  const [standaloneArmAuthorizationBasis, setStandaloneArmAuthorizationBasis] = useState<CompatecArmAuthorizationBasis | "">("");
  const [standaloneRemoteMode, setStandaloneRemoteMode] = useState<"total" | "zones">("total");
  const [connectionStatusModal, setConnectionStatusModal] = useState<'online' | 'offline' | null>(null);
  const [blockedClientsModal, setBlockedClientsModal] = useState(false);
  const [operationalStatusSearch, setOperationalStatusSearch] = useState("");
  const [manualOccurrenceOpen, setManualOccurrenceOpen] = useState(false);
  const [manualAccount, setManualAccount] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualPriority, setManualPriority] = useState<"critical" | "high" | "medium" | "low">("medium");
  const [bulkFinalizeOpen, setBulkFinalizeOpen] = useState(false);
  const [alertPlaying, setAlertPlaying] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioActivationNeeded, setAudioActivationNeeded] = useState(false);
  const [pendingPopup, setPendingPopup] = useState(false);
  const alertTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sirenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pendingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPopupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const persistedQueueSignatureRef = useRef("");
  const lastMessageNavigationIncidentRef = useRef<number | null>(null);
  const processedOperationalRefreshesRef = useRef<Set<string>>(new Set());
  const lastConnectionStatusRefreshAtRef = useRef(0);
  const lastDashboardReconciliationAtRef = useRef(0);
  const previousSocketConnectedRef = useRef<boolean | null>(null);
  const wasDashboardBackgroundedRef = useRef(false);
  const [observationOpen, setObservationOpen] = useState(false);
  const [observationUntil, setObservationUntil] = useState(() => dateTimeLocalValue(new Date(Date.now() + 30 * 60_000)));
  const [observationNotes, setObservationNotes] = useState("");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceStartAt, setMaintenanceStartAt] = useState(() => dateTimeLocalValue(new Date()));
  const [maintenanceEndAt, setMaintenanceEndAt] = useState(() => dateTimeLocalValue(new Date(Date.now() + 60 * 60_000)));
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [expandedQueue, setExpandedQueue] = useState<Exclude<QueueStatus, "waiting"> | null>(null);
  const [collapsedWaitingAccounts, setCollapsedWaitingAccounts] = useState<Set<string>>(() => new Set());
  const [remoteCommandOpen, setRemoteCommandOpen] = useState(false);
  const [remoteCommandType, setRemoteCommandType] = useState<RemoteCommandType>("arm");
  const [remoteCommandReason, setRemoteCommandReason] = useState("");
  const [remoteCommandArmAuthorizationBasis, setRemoteCommandArmAuthorizationBasis] = useState<CompatecArmAuthorizationBasis | "">("");
  const [remoteCommandZone, setRemoteCommandZone] = useState("");
  const [remoteCommandPgm, setRemoteCommandPgm] = useState("");
  const [remoteCommandPartition, setRemoteCommandPartition] = useState("1");

  useEffect(() => {
    selectedEventRef.current = selectedEvent;
    if (!selectedEvent && openingIncidentRef.current === null) { panelLeaseRef.current = null; setPanelLease(null); }
  }, [selectedEvent]);

  // Mutations
  const createOccurrenceMut = trpc.occurrence.create.useMutation();
  const createManualEventMut = trpc.alarmEvent.createManual.useMutation();
  const updateIncidentMut = trpc.incident.update.useMutation();
  const assumeIncidentMut = trpc.incident.assume.useMutation();
  const openPanelMut = trpc.incident.openPanel.useMutation({ retry: false });
  const renewPanelMut = trpc.incident.renewPanel.useMutation({ retry: false });
  const pausePanelMut = trpc.incident.pausePanel.useMutation({ retry: false });
  const renewPanelCallRef = useRef(renewPanelMut.mutateAsync);
  renewPanelCallRef.current = renewPanelMut.mutateAsync;
  const bulkFinalizeMut = trpc.incident.bulkFinalize.useMutation();
  const observeIncidentMut = trpc.incident.observe.useMutation();
  const recordAuditActionMut = trpc.incident.recordAction.useMutation({ retry: false });
  const startMaintenanceMut = trpc.alarmSystem.startMaintenance.useMutation();
  const endMaintenanceMut = trpc.alarmSystem.endMaintenance.useMutation();
  const simulateRemoteCommandMut = trpc.remoteCommand.simulate.useMutation();
  const queryBenchStatusMut = trpc.remoteCommand.queryBenchStatus.useMutation();
  const queryVettiBenchStatusMut = trpc.remoteCommand.queryVettiBenchStatus.useMutation();
  const disarmVettiBenchMut = trpc.remoteCommand.disarmVettiBench.useMutation();
  const queryBenchSectorsMut = trpc.remoteCommand.queryBenchSectors.useMutation();
  const armCompatecAllMut = trpc.remoteCommand.armCompatecAll?.useMutation?.() || { isPending: false, mutate: () => undefined };
  const disarmBenchAllMut = trpc.remoteCommand.disarmBenchAll.useMutation();
  const sendIntelbrasPhysicalMut = trpc.remoteCommand.sendIntelbrasPhysical?.useMutation?.() || { isPending: false, mutate: () => undefined };
  const passwordConfirmationMut = trpc.auth.login.useMutation();
  const { data: finalizacoes = [] } = trpc.finalization.list.useQuery(undefined);
  const [selectedFinalization, setSelectedFinalization] = useState<string>("");
  const [finalizationSearch, setFinalizationSearch] = useState("");
  const [treatmentPanel, setTreatmentPanel] = useState<"contacts" | "users" | "events" | "cameras" | null>(null);
  const [showProceduresModal, setShowProceduresModal] = useState(false);
  const [auditIncidentId, setAuditIncidentId] = useState<number | null>(null);
  const [failedAuditAction, setFailedAuditAction] = useState<Parameters<typeof recordAuditActionMut.mutateAsync>[0] | null>(null);
  const auditActionInFlight = useRef(false);
  const auditOutboxKey = `police-incident-audit-pending-${user?.id || 0}`;
  const utils = trpc.useUtils();
  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = localStorage.getItem(auditOutboxKey);
      if (!stored) return;
      const payload = JSON.parse(stored);
      if (Number.isSafeInteger(payload.incidentId) && typeof payload.requestId === "string" && typeof payload.action === "string") {
        // Tokens de lease nunca são persistidos; a regravação só pode usar a lease atualmente ativa.
        delete payload.leaseToken;
        setFailedAuditAction(payload);
        setAuditIncidentId(payload.incidentId);
      }
    } catch { toast.error("Não foi possível recuperar o registro de auditoria pendente neste navegador."); }
  }, [auditOutboxKey, user?.id]);
  useEffect(() => {
    if (selectedEvent?.incidentId) setAuditIncidentId(selectedEvent.incidentId);
  }, [selectedEvent?.incidentId]);
  async function recordAuditAction(input: Omit<Parameters<typeof recordAuditActionMut.mutateAsync>[0], "incidentId" | "requestId" | "leaseToken"> & { targetId?: number; tacticalStatus?: "en_route" | "arrived" | "inspection" | "completed" }, incidentId = selectedEvent?.incidentId) {
    if (!incidentId) return false;
    const lease = panelLeaseRef.current;
    if (!lease || lease.incidentId !== incidentId || leaseBlocked) { toast.warning("Este painel está somente para consulta; abra ou assuma novamente para registrar ações."); return false; }
    if (auditActionInFlight.current || failedAuditAction) {
      toast.warning("Conclua a gravação da auditoria pendente antes de registrar outra ação.");
      return false;
    }
    let requestId: string;
    try { requestId = createIncidentAuditRequestId(); }
    catch { toast.error("Seu navegador não forneceu geração segura do identificador de auditoria; nenhum registro foi enviado."); return false; }
    const payload = { ...input, incidentId, requestId, leaseToken: lease.leaseToken } as Parameters<typeof recordAuditActionMut.mutateAsync>[0];
    auditActionInFlight.current = true;
    try {
      const { leaseToken: _leaseToken, ...persistableAudit } = payload;
      localStorage.setItem(auditOutboxKey, JSON.stringify(persistableAudit));
      await recordAuditActionMut.mutateAsync(payload);
      localStorage.removeItem(auditOutboxKey);
      await utils.incident.auditTrail.invalidate({ incidentId: payload.incidentId });
      return true;
    } catch {
      setFailedAuditAction(payload);
      toast.error("Não foi possível confirmar a gravação na auditoria. Use Tentar gravar novamente; a mesma chave evita duplicação.");
      return false;
    } finally { auditActionInFlight.current = false; }
  }
  async function retryFailedAuditAction() {
    if (!failedAuditAction || auditActionInFlight.current) return;
    const lease = panelLeaseRef.current;
    if (!lease || lease.incidentId !== failedAuditAction.incidentId || leaseBlocked) {
      toast.warning("Abra ou assuma o painel desta ocorrência antes de tentar gravar a auditoria pendente.");
      return;
    }
    auditActionInFlight.current = true;
    try {
      await recordAuditActionMut.mutateAsync({ ...failedAuditAction, leaseToken: lease.leaseToken });
      localStorage.removeItem(auditOutboxKey);
      await utils.incident.auditTrail.invalidate({ incidentId: failedAuditAction.incidentId });
      setFailedAuditAction(null);
      toast.success("Registro de auditoria salvo.");
    } catch { toast.error("Auditoria ainda não foi gravada. O aviso foi preservado."); }
    finally { auditActionInFlight.current = false; }
  }
  async function openAuditedContact(action: "contact_call_clicked" | "contact_whatsapp_clicked", targetId: number, url: string) {
    if (auditActionInFlight.current || failedAuditAction || !selectedEvent?.incidentId) {
      toast.warning("Conclua a auditoria pendente antes de abrir a opção de contato.");
      return;
    }
    // Reserva uma janela no gesto do usuário; nenhum serviço externo é aberto antes do ACK da auditoria.
    const externalWindow = action === "contact_whatsapp_clicked" ? window.open("about:blank", "_blank") : null;
    if (externalWindow) externalWindow.opener = null;
    const saved = await recordAuditAction({ action, targetId });
    if (!saved) { externalWindow?.close(); return; }
    if (action === "contact_call_clicked") window.location.assign(url);
    else if (externalWindow) externalWindow.location.href = url;
    else toast.warning("Registro salvo. O navegador bloqueou a janela; permita a abertura e tente novamente.");
  }
  const reconcileDashboardData = useCallback(() => {
    // Tablets e navegadores em segundo plano podem pausar Socket.IO e timers.
    // Ao voltar à tela, a fila persistida volta a ser imediatamente a fonte de verdade.
    const now = Date.now();
    if (now - lastDashboardReconciliationAtRef.current < 2_000) return;
    lastDashboardReconciliationAtRef.current = now;
    void Promise.all([
      utils.incident.openQueue.invalidate(),
      utils.incident.auditTrail.invalidate(),
      utils.dashboard.armDisarmStatus.invalidate(),
      utils.dashboard.recentAutoFinalizedArmDisarm.invalidate(),
      utils.dashboard.connectionStatus.invalidate(),
      utils.dashboard.scheduleAlerts.invalidate(),
    ]);
  }, [utils]);

  const quickFinalizationOptions = useMemo(
    () => getQuickFinalizationOptions(finalizacoes, finalizationSearch),
    [finalizacoes, finalizationSearch],
  );

  const requestCloseAttendance = useCallback(() => {
    if (openingIncidentRef.current !== null || finalizationInFlightRef.current || panelTransitionInFlightRef.current) {
      toast.warning("Aguarde a confirmação da finalização desta ocorrência antes de sair.");
      return;
    }
    if (selectedEvent && panelLeaseRef.current?.incidentId === selectedEvent.incidentId && !leaseBlocked) {
      if (auditActionInFlight.current || failedAuditAction) {
        toast.warning("Conclua ou tente gravar a auditoria pendente antes de pausar o atendimento.");
        return;
      }
      setPausePanelReason(attendingNotes.trim() || selectedEvent.pauseReason || "");
      setPausePanelOpen(true);
      return;
    }
    if (!selectedEvent || viewOnly || leaseBlocked) {
      setSelectedEvent(null);
    }
  }, [selectedEvent, leaseBlocked, viewOnly, attendingNotes, failedAuditAction]);

  const confirmPausePanel = useCallback(async () => {
    if (panelTransitionInFlightRef.current || finalizationInFlightRef.current) return;
    const current = selectedEventRef.current;
    const lease = panelLeaseRef.current;
    if (!current?.incidentId || !lease || lease.incidentId !== current.incidentId) return;
    if (auditActionInFlight.current || failedAuditAction) { toast.warning("Conclua ou tente gravar a auditoria pendente antes de pausar o atendimento."); return; }
    const reason = pausePanelReason.trim();
    if (reason.length < 5) { toast.error("Informe o motivo da pausa (mínimo de 5 caracteres)."); return; }
    panelTransitionInFlightRef.current = true; setPanelTransitionBusy(true);
    try {
      await pausePanelMut.mutateAsync({ incidentId: current.incidentId, leaseToken: lease.leaseToken, reason });
      panelLeaseRef.current = null;
      setPanelLease(null);
      setLeaseBlocked(false);
      setPausePanelOpen(false);
      setViewOnly(false);
      setAssumeAvailable(false);
      setSelectedEvent(null);
      await utils.incident.openQueue.invalidate();
      toast.success("Atendimento pausado e liberado para outro operador.");
      const next = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      panelTransitionInFlightRef.current = false;
      if (next) void handleSelectEvent(next);
      const destination = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      if (destination) setLocation(destination);
    } catch (error: any) { toast.error(error?.message || "Não foi possível confirmar a pausa. O painel continua aberto."); } finally { panelTransitionInFlightRef.current = false; setPanelTransitionBusy(false); }
  }, [failedAuditAction, pausePanelMut, pausePanelReason, setLocation, utils]);

  useEffect(() => {
    if (!selectedEvent?.incidentId || !panelLease || panelLease.incidentId !== selectedEvent.incidentId || leaseBlocked) return;
    const incidentId = selectedEvent.incidentId;
    let renewing = false;
    let stopped = false;
    const interval = window.setInterval(async () => {
      const lease = panelLeaseRef.current;
      if (!lease || lease.incidentId !== incidentId || renewing || stopped) return;
      renewing = true;
      try {
        const renewed = await renewPanelCallRef.current({ incidentId, leaseToken: lease.leaseToken });
        if (stopped || panelLeaseRef.current?.leaseToken !== lease.leaseToken || selectedEventRef.current?.incidentId !== incidentId) return;
        const next = { ...lease, leaseExpiresAt: renewed.leaseExpiresAt };
        panelLeaseRef.current = next;
        setPanelLease(next);
      } catch (error: any) {
        if (stopped || panelLeaseRef.current?.leaseToken !== lease.leaseToken || selectedEventRef.current?.incidentId !== incidentId) return;
        panelLeaseRef.current = null;
        setPanelLease(null);
        setLeaseBlocked(true);
        setViewOnly(true);
        setPanelWarning("A renovação do painel falhou. Os controles foram bloqueados; feche para consulta ou tente abrir/assumir novamente.");
        toast.error(error?.message || "Lease do painel expirado ou indisponível. Os controles foram bloqueados.");
      } finally { renewing = false; }
    }, 15_000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [selectedEvent?.incidentId, panelLease?.leaseToken, leaseBlocked]);

  // A confirmação nativa protege o atendimento contra fechar ou recarregar a aba.
  useEffect(() => {
    if (!selectedEvent) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [selectedEvent]);

  // O Wouter usa links reais, mas a navegação interna não dispara beforeunload.
  // Interceptamos somente cliques normais para outra rota; botão direito, Ctrl/clique,
  // nova janela e links externos continuam livres para consulta sem alerta.
  useEffect(() => {
    if (!selectedEvent) return;
    const handleInternalNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!target) return;
      const shouldConfirm = shouldConfirmAttendanceNavigation({
        hasActiveAttendance: true,
        href: target.href,
        currentPath: window.location.pathname,
        baseHref: window.location.origin,
        target: target.target,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      });
      if (!shouldConfirm) return;
      if (panelLeaseRef.current?.incidentId === selectedEvent?.incidentId && !leaseBlocked) {
        event.preventDefault();
        event.stopPropagation();
        if (auditActionInFlight.current || failedAuditAction) { toast.warning("Conclua ou tente gravar a auditoria pendente antes de sair do atendimento."); return; }
        pendingNavigationRef.current = target.pathname + target.search + target.hash;
        setPausePanelReason(attendingNotes.trim() || selectedEvent?.pauseReason || "");
        setPausePanelOpen(true);
        return;
      }
      if (viewOnly || leaseBlocked || window.confirm("Existe um atendimento em andamento. Deseja sair sem finalizar esta ocorrência?")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", handleInternalNavigation, true);
    return () => document.removeEventListener("click", handleInternalNavigation, true);
  }, [selectedEvent, leaseBlocked, viewOnly, failedAuditAction, attendingNotes]);

  useEffect(() => {
    if (!selectedEvent) return;
    const currentUrl = window.location.href;
    let restoringUrl = false;
    const handleHistoryNavigation = () => {
      if (restoringUrl) return;
      if (panelLeaseRef.current?.incidentId === selectedEvent?.incidentId && !leaseBlocked) {
        pendingNavigationRef.current = "/dashboard";
        setPausePanelReason(attendingNotes.trim() || selectedEvent?.pauseReason || "");
        setPausePanelOpen(true);
      } else if (viewOnly || leaseBlocked || window.confirm("Existe um atendimento em andamento. Deseja sair sem finalizar esta ocorrência?")) return;
      restoringUrl = true;
      window.history.pushState(window.history.state, "", currentUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.setTimeout(() => { restoringUrl = false; }, 0);
    };
    window.addEventListener("popstate", handleHistoryNavigation, true);
    return () => window.removeEventListener("popstate", handleHistoryNavigation, true);
  }, [selectedEvent, leaseBlocked, viewOnly, attendingNotes]);

  const { connected, realtimeEvents, incidentUpdates } = useSocket();
  useEffect(() => {
    const reconcileOnVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasDashboardBackgroundedRef.current = true;
        return;
      }
      if (!wasDashboardBackgroundedRef.current) return;
      wasDashboardBackgroundedRef.current = false;
      reconcileDashboardData();
    };
    const reconcileOnPageRestore = (event: PageTransitionEvent) => {
      if (event.persisted) reconcileDashboardData();
    };
    window.addEventListener("pageshow", reconcileOnPageRestore);
    document.addEventListener("visibilitychange", reconcileOnVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", reconcileOnPageRestore);
      document.removeEventListener("visibilitychange", reconcileOnVisibilityChange);
    };
  }, [reconcileDashboardData]);
  useEffect(() => {
    const previousConnected = previousSocketConnectedRef.current;
    previousSocketConnectedRef.current = connected;
    if (previousConnected === false && connected) reconcileDashboardData();
  }, [connected, reconcileDashboardData]);

  // Queries
  const { data: persistedQueueData, isLoading: isPersistedQueueLoading } = trpc.incident.openQueue.useQuery(undefined, {
    // Socket.IO já atualiza a fila no instante em que um evento é persistido.
    // A consulta periódica é somente uma recuperação de segurança, para reduzir
    // picos de tráfego no proxy quando a tela recebe foco ou é recarregada.
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
  const { data: clientData } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: partnerCompanyData = [] } = trpc.partnerCompany.list.useQuery(undefined);
  const { data: systemData } = trpc.alarmSystem.list.useQuery(undefined);
  const { data: operationalAlarmUsers = [] } = trpc.alarmUser.operationalList.useQuery(undefined);
  const { data: armDisarmData } = trpc.dashboard.armDisarmStatus.useQuery(undefined, { refetchInterval: 30_000, retry: false });
  const { data: recentAutoFinalizedArmDisarm } = trpc.dashboard.recentAutoFinalizedArmDisarm.useQuery(undefined, { refetchInterval: 30_000, retry: false });
  const { data: scheduleAlerts = [] } = trpc.dashboard.scheduleAlerts.useQuery(undefined, { refetchInterval: 30_000, retry: false });
  const acknowledgeScheduleAlert = trpc.dashboard.acknowledgeScheduleAlert.useMutation({
    onSuccess: async () => {
      await utils.dashboard.scheduleAlerts.invalidate();
      toast.success("Alerta de agenda reconhecido.");
    },
    onError: (error) => toast.error(`Não foi possível reconhecer o alerta: ${error.message}`),
  });
  const { data: connectionSystemsData } = trpc.dashboard.connectionStatus.useQuery(undefined, { refetchInterval: 30_000, retry: false });
  const selectedSystem = useMemo(() => {
    if (!selectedEvent) return null;
    return resolveQueueEventSystem(selectedEvent, systemData || []);
  }, [selectedEvent, systemData]);
  const selectedRemoteIdentity = useMemo(
    () => resolveRemoteCommandIdentity(selectedEvent, selectedSystem),
    [selectedEvent, selectedSystem],
  );
  const selectedRemoteSystemId = selectedRemoteIdentity.systemId;
  const selectedRemoteBrand = selectedRemoteIdentity.brand;
  const { data: remoteCommandPgms = [] } = trpc.alarmPgm.list.useQuery({ alarmSystemId: selectedRemoteSystemId || 0 }, { enabled: Boolean(selectedRemoteSystemId) });
  const { data: remoteCompatecZones = [], isLoading: remoteCompatecZonesLoading } = trpc.alarmZone.list.useQuery(
    { alarmSystemId: selectedRemoteSystemId || 0 },
    { enabled: Boolean(selectedRemoteSystemId) && selectedRemoteBrand === "COMPATEC" },
  );
  const { data: remoteCredentialStatus } = trpc.alarmSystem.remoteCommandCredentialStatus.useQuery(
    { alarmSystemId: selectedRemoteSystemId || 0 },
    { enabled: Boolean(selectedRemoteSystemId) && selectedRemoteBrand === "INTELBRAS", refetchInterval: 10_000, retry: false },
  );
  const { data: remoteCommandHistory = [] } = trpc.remoteCommand.list.useQuery(
    { alarmSystemId: selectedRemoteSystemId || 0, limit: 8 },
    { enabled: Boolean(selectedRemoteSystemId), refetchInterval: 3000 },
  );
  const persistedQueue = persistedQueueData ?? EMPTY_QUEUE;
  const connectionSystems = connectionSystemsData ?? EMPTY_CONNECTION_SYSTEMS;
  const selectedArmDisarmState = useMemo<"armed" | "disarmed" | undefined>(() => {
    const systemId = selectedEvent?.alarmSystemId ?? selectedSystem?.id;
    if (!systemId) return undefined;
    const matchesSystem = (item: any) => item.alarmSystemId === systemId || item.systemId === systemId;
    if ((armDisarmData?.armed || []).some(matchesSystem)) return "armed";
    if ((armDisarmData?.disarmed || []).some(matchesSystem)) return "disarmed";
    return undefined;
  }, [selectedEvent?.alarmSystemId, selectedSystem?.id, armDisarmData]);
  const selectedIncidentNotesForDisplay = useMemo(
    () => getOperatorFacingIncidentNotes(selectedEvent?.incidentNotes),
    [selectedEvent?.incidentNotes],
  );
  const selectedEventArgument = useMemo(() => {
    if (!selectedEvent) return "Argumento não informado";
    if (isUnidentifiedApplicationUserEvent(selectedEvent)) return "Usuário do painel: não informado";
    return formatContactIdArgument({ eventCode: selectedEvent.eventCode, qualifier: selectedEvent.qualifier, value: selectedEvent.zoneUser });
  }, [selectedEvent?.eventCode, selectedEvent?.qualifier, selectedEvent?.zoneUser]);

  const manualAccountMatch = useMemo(() => {
    const normalize = (value?: string | null) => (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const account = normalize(manualAccount);
    if (!account) return { system: null, client: null };
    const systems = systemData || [];
    const system = systems.find((item: any) => normalize(item.account) === account)
      || systems.find((item: any) => {
        const systemAccount = normalize(item.account);
        return account.length >= 4 && systemAccount.length >= 4 && account.slice(-4) === systemAccount.slice(-4);
      })
      || null;
    const client = system ? (clientData || []).find((item: any) => item.id === system.clientId) || null : null;
    return { system, client };
  }, [manualAccount, systemData, clientData]);

  const onlineSystems = useMemo(() => connectionSystems.filter((system: any) => system.connectionStatus === "online"), [connectionSystems]);
  const offlineSystems = useMemo(() => connectionSystems.filter((system: any) => system.connectionStatus === "offline"), [connectionSystems]);
  const clientsById = useMemo(() => new Map((clientData || []).map((client: any) => [client.id, client])), [clientData]);
  const partnersById = useMemo(() => new Map((partnerCompanyData || []).map((partner: any) => [partner.id, partner])), [partnerCompanyData]);
  const blockedClients = useMemo(() => (clientData || []).filter((client: any) => getEffectiveClientMonitoringStatus(client) !== "active"), [clientData]);
  const operationalSearchMatches = useCallback((item: any, client?: any) => matchesOperationalStatusSearch({
    ...item,
    clientName: item.clientName || client?.name,
    clientFantasyName: item.clientFantasyName || client?.fantasyName,
    partnerName: item.partnerName || partnersById.get(client?.partnerCompanyId)?.name,
    name: client?.name,
    fantasyName: client?.fantasyName,
  }, operationalStatusSearch), [operationalStatusSearch, partnersById]);
  const connectionStatusSystems = useMemo(() => {
    const systems = connectionStatusModal === "online" ? onlineSystems : offlineSystems;
    return systems.filter((system: any) => operationalSearchMatches(system, clientsById.get(system.clientId)));
  }, [connectionStatusModal, onlineSystems, offlineSystems, operationalSearchMatches, clientsById]);
  const armDisarmSystems = useMemo(() => {
    const systems = armDisarmModal === "armed" ? armDisarmData?.armed || [] : armDisarmData?.disarmed || [];
    return systems.filter((system: any) => operationalSearchMatches(system, clientsById.get(system.clientId)));
  }, [armDisarmModal, armDisarmData, operationalSearchMatches, clientsById]);
  const standaloneRemoteSystemId = Number(standaloneRemoteRequest?.alarmSystemId || standaloneRemoteRequest?.systemId || 0);
  const standaloneRemoteSystem = (systemData || []).find((item: any) => item.id === standaloneRemoteSystemId);
  const filteredBlockedClients = useMemo(() => blockedClients.filter((client: any) => operationalSearchMatches({ accounts: client.accounts }, client)), [blockedClients, operationalSearchMatches]);

  // Processar novos eventos em tempo real
  useEffect(() => {
    if (realtimeEvents.length === 0) return;
    const newEvents: QueueEvent[] = [];
    realtimeEvents.forEach((ev) => {
      if (ev.kind === "keepalive" || ev.kind === "arm_disarm_confirmation" || ev.kind === "remote_command_confirmation" || ev.kind === "remote_command_ack" || ev.kind === "radioenge_observation_escalated" || ev.kind === "alarm_schedule_alert") {
        const operationalKey = `${ev.kind}-${ev.alarmSystemId || "unknown"}-${ev.timestamp}`;
        if (processedOperationalRefreshesRef.current.has(operationalKey)) return;
        processedOperationalRefreshesRef.current.add(operationalKey);
        if (processedOperationalRefreshesRef.current.size > 500) processedOperationalRefreshesRef.current.clear();

        if (ev.kind === "keepalive") {
          // Várias centrais podem confirmar ao mesmo tempo. Limitar a consulta
          // preserva atualização rápida sem recriar o problema de excesso de
          // requisições do proxy.
          const now = Date.now();
          if (now - lastConnectionStatusRefreshAtRef.current >= 10_000) {
            lastConnectionStatusRefreshAtRef.current = now;
            void utils.dashboard.connectionStatus.invalidate();
          }
        } else if (ev.kind === "remote_command_confirmation") {
          void utils.incident.openQueue.invalidate();
          void utils.dashboard.armDisarmStatus.invalidate();
          toast.success(`${ev.actionLabel || "Comando remoto"} confirmado pela central.`);
        } else if (ev.kind === "remote_command_ack") {
          if (ev.alarmSystemId) void utils.remoteCommand.list.invalidate({ alarmSystemId: ev.alarmSystemId, limit: 8 });
          if (ev.incidentId) void utils.incident.openQueue.invalidate();
          const isArmDisarmAck = ev.commandType === "arm" || ev.commandType === "disarm";
          const responseCode = ev.responsePayload?.match(/^MB=KA[14]/)?.[0] || (isArmDisarmAck ? "MB=KA4" : "MB=KA1");
          const caution = isArmDisarmAck
            ? "A resposta não confirma o estado final; confira o evento/status real do painel."
            : "Isso indica recebimento, não confirma o estado final do bypass.";
          if (ev.commandType === "configure_zones") {
            toast.success("Alteração dos setores recebida. Confira o estado final no painel.", { duration: 12_000 });
          } else {
            toast.info(`${ev.actionLabel || "Comando Compatec"}: resposta ${responseCode} recebida. ${caution}`, { duration: 12_000 });
          }
        } else if (ev.kind === "radioenge_observation_escalated") {
          void utils.incident.openQueue.invalidate();
          startAlertSound();
          toast.error(`Falha Radioenge E361 da conta ${ev.account} excedeu 4 segundos sem R361 e foi encaminhada para atendimento.`);
        } else if (ev.kind === "alarm_schedule_alert") {
          void utils.dashboard.scheduleAlerts.invalidate();
          startAlertSound();
          const alertMessage = ev.alertType === "unexpected_disarm"
            ? `A conta ${ev.account} foi desarmada fora do horário da agenda.`
            : `A conta ${ev.account} continua desarmada após o horário programado.`;
          toast.error(alertMessage, { duration: 12_000 });
        } else {
          void utils.dashboard.armDisarmStatus.invalidate();
          void utils.dashboard.recentAutoFinalizedArmDisarm.invalidate();
        }
        return;
      }
      const persistedEvent = ev as typeof ev & { incidentId?: number };
      if (ev.kind === "restoration_closed") {
        const closeKey = `restoration-${ev.originalEventId}-${ev.id}`;
        if (!processedIds.current.has(closeKey)) {
          processedIds.current.add(closeKey);
          setQueues((prev) => prev.filter((queued: any) => queued.id !== ev.originalEventId));
          if (selectedEvent?.id === ev.originalEventId) setSelectedEvent(null);
          toast.success(ev.restorationDescription || ev.description || "Finalizado com a restauração do evento");
        }
        return;
      }
      // O receptor só emite eventos de atendimento depois de gravar event +
      // incident juntos. Sem incidentId não há card temporário na operação.
      if (!persistedEvent.incidentId) {
        console.warn("[Dashboard] Evento sem incidente persistido ignorado", ev);
        void utils.incident.openQueue.invalidate();
        return;
      }
      const evKey = `${ev.account}-${ev.eventCode}-${ev.timestamp || Date.now()}`;
      if (!processedIds.current.has(evKey)) {
        processedIds.current.add(evKey);
        const system = resolveQueueEventSystem(ev, systemData || []);
        const client = resolveQueueEventClient(ev, system, clientData || []);
        newEvents.push({
          ...ev,
          queueStatus: "waiting",
          queuedAt: Date.now(),
          clientName: client ? (client.fantasyName || client.name) : (ev.account === "0000" ? "CONTA DO SISTEMA (0000)" : (ev.account ? `CONTA NÃO CADASTRADA (${ev.account})` : "CONTA DO SISTEMA (0000)")),
          systemModel: system ? `${system.brand} ${system.model || ''}`.trim() : ev.brand,
          description: ev.description || 'EVENTO NÃO CADASTRADO',
        });
      }
    });
    if (newEvents.length > 0) {
      setQueues((prev) => [...newEvents, ...prev]);
      void utils.incident.openQueue.invalidate();
      // Tocar som por 5 segundos
      startAlertSound();
    }
  }, [realtimeEvents, clientData, systemData, utils]);

  // Reconstrói a fila por dados persistidos também após troca de usuário e prazos expirados.
  // A assinatura impede atualização circular sem ocultar mudanças reais de status.
  useEffect(() => {
    if (!isPersistedQueueLoading && persistedQueueData) {
      const signature = persistedQueue.map((ev: any) => `${ev.incidentId}:${ev.incidentStatus}:${ev.incidentOperatorId ?? ""}:${ev.incidentOperatorName ?? ""}:${ev.panelActive ? 1 : 0}:${ev.panelOperatorId ?? ""}:${ev.panelOperatorName ?? ""}:${ev.panelLeaseExpiresAt || ""}:${ev.pauseReason || ""}:${ev.incidentVersion ?? ""}:${ev.observationUntil || ""}:${ev.incidentNotes || ""}:${ev.receivedAt}`).join("|");
      if (signature === persistedQueueSignatureRef.current) return;
      const initial: QueueEvent[] = persistedQueue.map((ev: any) => {
        const system = resolveQueueEventSystem(ev, systemData || []);
        const client = resolveQueueEventClient(ev, system, clientData || []);
        const evKey = `${ev.account}-${ev.eventCode}-${ev.receivedAt}`;
        processedIds.current.add(evKey);
        return {
          ...ev,
          queueStatus: incidentStatusToQueueStatus(ev.incidentStatus),
          queuedAt: new Date(ev.receivedAt).getTime(),
          observationUntil: ev.observationUntil || null,
          panelActive: Boolean(ev.panelActive),
          panelOperatorId: ev.panelOperatorId ?? null,
          panelOperatorName: ev.panelOperatorName ?? null,
          panelLeaseExpiresAt: ev.panelLeaseExpiresAt || null,
          pauseReason: ev.pauseReason || null,
          clientName: client ? (client.fantasyName || client.name) : (ev.account === "0000" ? "CONTA DO SISTEMA (0000)" : (ev.account ? `CONTA NÃO CADASTRADA (${ev.account})` : "CONTA DO SISTEMA (0000)")),
          systemModel: system ? `${system.brand} ${system.model || ''}`.trim() : ev.brand,
          description: ev.description || 'EVENTO NÃO CADASTRADO',
        };
      });
      persistedQueueSignatureRef.current = signature;
      setQueues((previous) => {
        const onlyRealtimeEvents = previous.filter((event) => !event.incidentId);
        return [...onlyRealtimeEvents, ...initial];
      });
      setSelectedEvent((previous) => {
        if (!previous?.incidentId) return previous;
        const refreshed = initial.find((event) => event.incidentId === previous.incidentId);
        // Outra tela pode finalizar o atendimento enquanto esta aba estava
        // suspensa. Não manter um modal de atendimento para uma ocorrência
        // que já não existe mais na fila persistida.
        return refreshed ? { ...previous, ...refreshed } : null;
      });
    }
  }, [persistedQueueData, isPersistedQueueLoading, clientData, systemData]);

  useEffect(() => {
    const update = incidentUpdates?.[0];
    if (!update) return;
    void utils.incident.openQueue.invalidate();
    void utils.incident.history.invalidate();
    void utils.incident.auditTrail.invalidate();
    if (update.incidentStatus === "closed") {
      setSelectedEvent((previous) => previous?.incidentId === update.incidentId ? null : previous);
    }
  }, [incidentUpdates?.[0]?.timestamp, utils]);

  // Função para tocar som de alerta por 5 segundos
  function startAlertSound() {
    if (!audioEnabled) {
      setAudioActivationNeeded(true);
      toast.warning("Novo evento recebido. Clique em ‘Ativar áudio’ para habilitar os alertas sonoros.");
      return;
    }
    setAlertPlaying(true);
    try {
      if (audioRef.current) {
        audioRef.current.volume = 1;
        void audioRef.current.play().catch(() => setAudioActivationNeeded(true));
      }
    } catch {}
    const playSirenPulse = () => {
      try {
        const AudioContextCtor = window.AudioContext;
        const context = audioContextRef.current || new AudioContextCtor();
        audioContextRef.current = context;
        if (context.state === "suspended") void context.resume();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.exponentialRampToValueAtTime(1280, now + 0.22);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
      } catch {}
    };
    playSirenPulse();
    if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
    sirenIntervalRef.current = setInterval(playSirenPulse, 650);
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => {
      stopAlertSound();
    }, 5000);
  }

  async function enableAlertAudio() {
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const context = audioContextRef.current || new AudioContextCtor();
      audioContextRef.current = context;
      if (context.state === "suspended") await context.resume();
      if (audioRef.current) {
        audioRef.current.volume = 0;
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 1;
      }
      setAudioEnabled(true);
      setAudioActivationNeeded(false);
      toast.success("Alertas sonoros ativados para esta sessão.");
    } catch {
      setAudioEnabled(false);
      setAudioActivationNeeded(true);
      toast.error("O navegador bloqueou o áudio. Clique novamente em ‘Ativar áudio’.");
    }
  }

  async function disableAlertAudio(password: string, reason: string) {
    if (!password) {
      toast.error("Informe sua senha para desativar o áudio.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Informe o motivo para desativar o áudio.");
      return;
    }
    try {
      if (!user?.email) {
        throw new Error("Não foi possível identificar o e-mail do usuário logado.");
      }
      // Reutiliza o mesmo fluxo que autorizou a sessão atual, garantindo a mesma senha aceita no login.
      await passwordConfirmationMut.mutateAsync({ email: user.email, password });
      stopAlertSound();
      setAudioEnabled(false);
      setAudioActivationNeeded(true);
      toast.success(`Alertas sonoros desativados. Motivo: ${reason.trim()}`);
    } catch (error: any) {
      toast.error(error?.message || "Senha inválida. O áudio continua ativo.");
    }
  }

  function requestAudioDeactivation() {
    // A confirmação nativa elimina a camada reativa que causava React #185 na VPS.
    const password = window.prompt("Para desativar os alertas sonoros, informe a senha do usuário logado:");
    if (password === null) return;
    const reason = window.prompt("Informe o motivo obrigatório para desativar os alertas sonoros:");
    if (reason === null) return;
    void disableAlertAudio(password, reason);
  }

  function openManualOccurrence() {
    // O modal anterior montava opções a partir da consulta reativa de sistemas. Com dados
    // chegando ou sendo atualizados na VPS, esse acoplamento re-renderizava o subtree até
    // provocar React #185. O formulário abre isolado e recebe a Conta Contact ID como texto.
    setManualAccount("");
    setManualDescription("");
    setManualPriority("medium");
    setManualOccurrenceOpen(true);
  }

  function stopAlertSound() {
    setAlertPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
  }

  // Popup de pendentes a cada 20 minutos
  useEffect(() => {
    pendingIntervalRef.current = setInterval(() => {
      if (selectedEvent) return;
      const waitingCount = queues.filter(q => q.queueStatus === 'waiting').length;
      if (waitingCount > 0) {
        setPendingPopup(true);
        startAlertSound();
        pendingPopupTimeoutRef.current = setTimeout(() => {
          setPendingPopup(false);
          stopAlertSound();
        }, 10000);
      }
    }, 20 * 60 * 1000); // 20 minutos
    return () => {
      if (pendingIntervalRef.current) clearInterval(pendingIntervalRef.current);
      if (pendingPopupTimeoutRef.current) clearTimeout(pendingPopupTimeoutRef.current);
    };
  }, [queues, selectedEvent]);

  function closePendingPopup() {
    setPendingPopup(false);
    stopAlertSound();
    if (pendingPopupTimeoutRef.current) {
      clearTimeout(pendingPopupTimeoutRef.current);
      pendingPopupTimeoutRef.current = null;
    }
  }
  useEffect(() => {
    if (selectedEvent && pendingPopup) closePendingPopup();
  }, [selectedEvent?.incidentId, pendingPopup]);

  // Reivindicação e transição são atômicas no servidor; só o incidente certo é atualizado.
  const canOperateSelected = Boolean(selectedEvent?.incidentId && panelLease?.incidentId === selectedEvent.incidentId && !leaseBlocked && !viewOnly && !panelTransitionBusy);

  function closePanelAfterAck() {
    selectedEventRef.current = null;
    panelLeaseRef.current = null;
    setPanelLease(null);
    setSelectedEvent(null);
    setLeaseBlocked(false);
    setViewOnly(false);
    setAssumeAvailable(false);
    setAttendingNotes("");
    setLogs([]);
    void utils.incident.openQueue.invalidate();
  }

  const moveEvent = useCallback(async (ev: QueueEvent, reason: string) => {
    if (panelTransitionInFlightRef.current || finalizationInFlightRef.current || auditActionInFlight.current || failedAuditAction) { toast.warning("Aguarde a gravação da ação pendente antes de encaminhar."); return null; }
    const lease = panelLeaseRef.current;
    if (!ev.incidentId || !lease || lease.incidentId !== ev.incidentId || leaseBlocked) return null;
    if (reason.trim().length < 5) { toast.error("Informe o motivo obrigatório para encaminhar ao Tático (mínimo de 5 caracteres)."); return null; }
    panelTransitionInFlightRef.current = true; setPanelTransitionBusy(true);
    try {
      const result = await updateIncidentMut.mutateAsync({ id: ev.incidentId, status: "dispatched", leaseToken: lease.leaseToken, notes: reason.trim() });
      await Promise.all([utils.incident.openQueue.invalidate(), utils.incident.auditTrail.invalidate({ incidentId: ev.incidentId })]);
      toast.success("Ocorrência encaminhada ao Tático e painel liberado.");
      closePanelAfterAck();
      return result;
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível encaminhar a ocorrência ao Tático.");
      await utils.incident.openQueue.invalidate();
      return null;
    } finally { panelTransitionInFlightRef.current = false; setPanelTransitionBusy(false); }
  }, [updateIncidentMut, utils, leaseBlocked, failedAuditAction]);

  // Finalizar evento
  // finalizeEvent definido abaixo de selectedClient/selectedSystem

  // Agrupar por fila
  const grouped = useMemo(() => {
    const g = { attending: [] as QueueEvent[], observing: [] as QueueEvent[], tactical: [] as QueueEvent[], maintenance: [] as QueueEvent[], waiting: [] as QueueEvent[] };
    queues.forEach((q) => { if (g[q.queueStatus]) g[q.queueStatus].push(q); });
    return g;
  }, [queues]);

  const visibleWaitingEvents = useMemo(
    () => [...grouped.waiting].sort((left, right) => right.queuedAt - left.queuedAt),
    [grouped.waiting]
  );

  const waitingGroups = useMemo(() => {
    const groups = new Map<string, QueueEvent[]>();
    visibleWaitingEvents.forEach((event) => {
      const key = event.alarmSystemId ? `system-${event.alarmSystemId}` : `account-${event.account}`;
      groups.set(key, [...(groups.get(key) || []), event]);
    });
    return Array.from(groups.entries()).map(([key, events]) => ({ key, events }));
  }, [visibleWaitingEvents]);

  function toggleWaitingAccount(key: string) {
    setCollapsedWaitingAccounts((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function countSameClient(ev: QueueEvent) {
    return new Set(queues.filter((item) => isSameBulkScope(item, ev) && item.incidentId && item.incidentId !== ev.incidentId).map((item) => item.incidentId)).size;
  }

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs((prev) => [`[${time}] ${msg}`, ...prev]);
  }

  async function handleSelectEvent(ev: QueueEvent, assume = false) {
    if (ev.incidentId && panelLeaseRef.current?.incidentId === ev.incidentId && !leaseBlocked) return;
    if (openingIncidentRef.current !== null) return;
    if (panelLeaseRef.current && panelLeaseRef.current.incidentId !== ev.incidentId) {
      pendingSelectionRef.current = ev;
      requestCloseAttendance();
      return;
    }
    if (finalizationInFlightRef.current || panelTransitionInFlightRef.current) {
      toast.info("Aguarde a confirmação da finalização em andamento antes de abrir outra ocorrência.");
      return;
    }
    // Parar som de alerta ao clicar no evento
    stopAlertSound();
    if (!ev.incidentId) { setSelectedEvent(ev); return; }
    setOpenPending(true);
    setAuditIncidentId(ev.incidentId);
    setAttendingNotes("");
    setLogs([]);
    setActiveTab("cameras");
    openingIncidentRef.current = ev.incidentId;
    try {
      if (ev.panelActive && ev.panelOperatorId !== user?.id) {
        setViewOnly(true);
        setAssumeAvailable(false);
        setPanelWarning(`OCORRÊNCIA EM ATENDIMENTO POR ${ev.panelOperatorName || "OUTRO OPERADOR"}`);
        setSelectedEvent(ev);
        return;
      }
      let leaseToken: string;
      try { leaseToken = createIncidentAuditRequestId(); }
      catch { toast.error("Não foi possível gerar o identificador seguro da sessão do painel."); return; }
      try {
        const opened = await openPanelMut.mutateAsync({ incidentId: ev.incidentId, leaseToken, ...(assume ? { assume: true } : {}) });
        const lease = { incidentId: ev.incidentId, leaseToken: opened.leaseToken || leaseToken, leaseExpiresAt: opened.leaseExpiresAt };
        panelLeaseRef.current = lease;
        setPanelLease(lease);
        setLeaseBlocked(false);
        setViewOnly(false);
        setAssumeAvailable(false);
        setPanelWarning("");
        const updated: QueueEvent = { ...ev, queueStatus: incidentStatusToQueueStatus(opened.status), incidentOperatorId: opened.operatorId, incidentOperatorName: opened.operatorName, incidentNotes: opened.notes, pauseReason: opened.pauseReason, parentIncidentId: opened.parentIncidentId, observationUntil: ev.observationUntil };
        setSelectedEvent(updated);
        setQueues((previous) => previous.map((item) => item.incidentId === ev.incidentId ? { ...item, ...updated, panelActive: true, panelOperatorId: user?.id, panelOperatorName: user?.name } : item));
        if (assume) toast.success("Atendimento assumido; o status da fila foi preservado.");
        else if (ev.queueStatus === "waiting") addLog("Painel exclusivo aberto; ocorrência recebida para atendimento.");
        setAttendStartTime(Date.now());
        setAttendingNotes(opened.pauseReason || "");
        await Promise.all([utils.incident.openQueue.invalidate(), utils.incident.auditTrail.invalidate({ incidentId: ev.incidentId })]);
      } catch (error: any) {
        const livePanel = Boolean(ev.panelActive);
        setViewOnly(true);
        setPanelWarning(livePanel
          ? `OCORRÊNCIA EM ATENDIMENTO POR ${ev.panelOperatorName || "OUTRO OPERADOR"}`
          : "Não foi possível adquirir o painel exclusivo. Esta tela está somente para consulta; atualize a fila e tente abrir ou assumir novamente.");
        const canAssume = !livePanel && (ev.incidentOperatorId != null && ev.incidentOperatorId !== user?.id || /assumir atendimento/i.test(error?.message || ""));
        setAssumeAvailable(canAssume);
        setSelectedEvent(ev);
        if (livePanel) toast.info(`Ocorrência em atendimento por ${ev.panelOperatorName || "outro operador"}. Consulta somente leitura.`);
        else if (canAssume) toast.info("Use Assumir atendimento para transferir a responsabilidade desta ocorrência.");
        else toast.error(error?.message || "Não foi possível abrir o painel exclusivo. Nenhum controle foi habilitado.");
      }
      setAttendStartTime(Date.now());
    } finally {
      openingIncidentRef.current = null;
      setOpenPending(false);
    }
  }

  useEffect(() => {
    const rawIncidentId = new URLSearchParams(search).get("incidentId");
    if (!rawIncidentId) {
      lastMessageNavigationIncidentRef.current = null;
      return;
    }
    const incidentId = Number(rawIncidentId);
    if (!Number.isSafeInteger(incidentId) || incidentId <= 0 || lastMessageNavigationIncidentRef.current === incidentId) return;
    if (isPersistedQueueLoading || !persistedQueueData) return;
    const target = queues.find((event) => event.incidentId === incidentId);
    if (!target && persistedQueueData.some((event: any) => Number(event.incidentId) === incidentId)) return;
    lastMessageNavigationIncidentRef.current = incidentId;
    if (!target) {
      toast.error("Esse atendimento já foi finalizado ou não está mais na fila.");
      setLocation("/dashboard");
      return;
    }
    if (finalizationInFlightRef.current || panelTransitionInFlightRef.current || createOccurrenceMut.isPending) {
      toast.info("Aguarde a confirmação da finalização em andamento antes de abrir outra ocorrência.");
      setLocation("/dashboard");
      return;
    }
    if (selectedEvent?.incidentId === incidentId) { setLocation("/dashboard"); return; }
    if (selectedEvent && !window.confirm("Existe um atendimento em andamento. Deseja abrir o atendimento da mensagem sem finalizar o atual?")) {
      setLocation("/dashboard");
      return;
    }
    setLocation("/dashboard");
    void handleSelectEvent(target);
  }, [search, isPersistedQueueLoading, persistedQueueData, queues, setLocation, selectedEvent, createOccurrenceMut.isPending]);

  const isOtherOperatorObservation = Boolean(viewOnly && !selectedEvent?.panelActive && selectedEvent?.incidentOperatorId != null && selectedEvent.incidentOperatorId !== user?.id);
  const isOtherOperatorAttendance = Boolean(viewOnly && selectedEvent?.panelActive && selectedEvent.panelOperatorId !== user?.id);
  const { data: bulkPreview, isFetching: isBulkPreviewFetching, error: bulkPreviewError, refetch: refreshBulkPreview } = trpc.incident.bulkPreview.useQuery({
    account: selectedEvent?.account || "0000",
    alarmSystemId: selectedEvent?.alarmSystemId ?? selectedEvent?.incidentSystemId ?? 0,
  }, {
    enabled: Boolean(bulkFinalizeOpen && (selectedEvent?.alarmSystemId ?? selectedEvent?.incidentSystemId)),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });

  async function assumeSelectedObservation() {
    if (!selectedEvent?.incidentId || openingIncidentRef.current === selectedEvent.incidentId) return;
    const target = selectedEvent;
    setSelectedEvent(null);
    void handleSelectEvent(target, true);
  }

  const selectedCompatecDisarmEnabled = useMemo(() => {
    return selectedSystem?.brand === "COMPATEC" && selectedSystem.isActive !== false;
  }, [selectedSystem]);
  const selectedCompatecAction = useMemo<"arm" | "disarm" | undefined>(() => {
    if (!selectedCompatecDisarmEnabled) return undefined;
    if (selectedArmDisarmState === "armed") return "disarm";
    if (selectedArmDisarmState === "disarmed") return "arm";
    return undefined;
  }, [selectedCompatecDisarmEnabled, selectedArmDisarmState]);

  const selectedIntelbrasPhysicalEnabled = useMemo(() => {
    const normalizedModel = String(selectedSystem?.model || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    return selectedRemoteBrand === "INTELBRAS"
      && selectedSystem?.isActive !== false
      && normalizedModel.includes("AMT8000");
  }, [selectedRemoteBrand, selectedSystem]);
  const selectedIntelbrasBenchEnabled = Boolean(remoteCredentialStatus?.laboratoryEnabled);
  const selectedIntelbrasPasswordConfigured = Boolean(remoteCredentialStatus?.credentials.some(
    (credential) => credential.credentialKind === "intelbras_master",
  ));
  const selectedIntelbrasOnline = connectionSystems.some(
    (system: any) => system.id === selectedRemoteSystemId && system.connectionStatus === "online",
  );
  const selectedIntelbrasAction = useMemo<"arm" | "disarm" | undefined>(() => {
    if (!INTELBRAS_PHYSICAL_COMMAND_ENABLED || !selectedIntelbrasPhysicalEnabled || !selectedIntelbrasBenchEnabled || !selectedIntelbrasPasswordConfigured || !selectedIntelbrasOnline) return undefined;
    if (selectedArmDisarmState === "armed") return "disarm";
    if (selectedArmDisarmState === "disarmed") return "arm";
    return undefined;
  }, [selectedIntelbrasPhysicalEnabled, selectedIntelbrasBenchEnabled, selectedIntelbrasPasswordConfigured, selectedIntelbrasOnline, selectedArmDisarmState]);

  const selectedClient = useMemo(() => {
    if (!selectedEvent) return null;
    return resolveQueueEventClient(selectedEvent, selectedSystem, clientData || []);
  }, [selectedEvent, selectedSystem, clientData]);

  const selectedPartner = useMemo(() => {
    if (!selectedClient?.partnerCompanyId) return null;
    return partnerCompanyData.find((partner: any) => partner.id === selectedClient.partnerCompanyId) || null;
  }, [selectedClient, partnerCompanyData]);

  const { data: treatmentContacts = [] } = trpc.clientContact.list.useQuery(
    { clientId: selectedClient?.id || 0, alarmSystemId: selectedSystem?.id || 0 },
    { enabled: !!selectedClient?.id && !!selectedSystem?.id }
  );
  const { data: treatmentZones = [] } = trpc.alarmZone.list.useQuery(
    { alarmSystemId: selectedSystem?.id || 0 },
    { enabled: !!selectedSystem?.id }
  );
  const vettiTwentyFourHourZones = useMemo(() => treatmentZones.filter((zone: any) => isVetti24HourZone(zone) && zone.isActive !== false), [treatmentZones]);
  const { data: treatmentAlarmUsers = [] } = trpc.alarmUser.list.useQuery(
    { alarmSystemId: selectedSystem?.id || 0 },
    { enabled: !!selectedSystem?.id }
  );
  const selectedPanelUser = useMemo(() => {
    if (!selectedEvent || !isPanelUserDisplayEvent(selectedEvent)) return null;
    const eventUserNumber = Number(selectedEvent.zoneUser);
    if (!Number.isInteger(eventUserNumber)) return null;
    return operationalAlarmUsers.find((panelUser: any) => panelUser.alarmSystemId === selectedSystem?.id && Number(panelUser.userNumber) === eventUserNumber) || null;
  }, [selectedEvent, selectedSystem?.id, operationalAlarmUsers]);
  const treatmentProcedureQuery = trpc.clientProcedure.treatment.useQuery(
    { clientId: selectedClient?.id || 0, eventId: selectedEvent?.id || 0 },
    { enabled: !!selectedClient?.id && !!selectedEvent?.id, refetchInterval: 30_000, staleTime: 0 }
  );
  const treatmentProcedureData = treatmentProcedureQuery.data?.clientId === selectedClient?.id
    && treatmentProcedureQuery.data?.eventId === selectedEvent?.id ? treatmentProcedureQuery.data : undefined;
  const treatmentProcedures = treatmentProcedureData?.procedures || [];

  const selectedSystemInMaintenance = useMemo(() => {
    if (!selectedSystem?.maintenanceStartAt || !selectedSystem.maintenanceEndAt) return false;
    const now = Date.now();
    return new Date(selectedSystem.maintenanceStartAt).getTime() <= now
      && new Date(selectedSystem.maintenanceEndAt).getTime() > now;
  }, [selectedSystem]);

  function openObservation() {
    if (!selectedEvent?.incidentId) {
      toast.error("Esta ocorrência ainda não possui um identificador para observação.");
      return;
    }
    setObservationUntil(dateTimeLocalValue(new Date(Date.now() + 30 * 60_000)));
    setObservationNotes("");
    setObservationOpen(true);
  }

  async function confirmObservation() {
    if (panelTransitionInFlightRef.current || finalizationInFlightRef.current || auditActionInFlight.current || failedAuditAction) { toast.warning("Aguarde a gravação da ação pendente antes de encaminhar."); return; }
    const lease = panelLeaseRef.current;
    if (!selectedEvent?.incidentId || !lease || lease.incidentId !== selectedEvent.incidentId || leaseBlocked) return;
    const until = new Date(observationUntil);
    if (Number.isNaN(until.getTime()) || until <= new Date()) {
      toast.error("Informe uma data e hora futura para a observação.");
      return;
    }
    const reason = observationNotes.trim();
    if (reason.length < 5) { toast.error("Informe o motivo obrigatório da observação (mínimo de 5 caracteres)."); return; }
    panelTransitionInFlightRef.current = true; setPanelTransitionBusy(true);
    try {
      await observeIncidentMut.mutateAsync({ incidentId: selectedEvent.incidentId, until, notes: reason, leaseToken: lease.leaseToken });
      setObservationOpen(false);
      closePanelAfterAck();
      await utils.incident.openQueue.invalidate();
      toast.success("Ocorrência enviada para observação e painel liberado.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível iniciar a observação.");
    } finally { panelTransitionInFlightRef.current = false; setPanelTransitionBusy(false); }
  }

  function openMaintenance() {
    if (!selectedSystem) {
      toast.error("Selecione uma ocorrência vinculada a um sistema cadastrado.");
      return;
    }
    setMaintenanceStartAt(dateTimeLocalValue(new Date()));
    setMaintenanceEndAt(dateTimeLocalValue(new Date(Date.now() + 60 * 60_000)));
    setMaintenanceNotes("");
    setMaintenanceOpen(true);
  }

  async function confirmMaintenance() {
    if (panelTransitionInFlightRef.current || finalizationInFlightRef.current || auditActionInFlight.current || failedAuditAction) { toast.warning("Aguarde a gravação da ação pendente antes de encaminhar."); return; }
    const lease = panelLeaseRef.current;
    if (!selectedSystem || !selectedEvent?.incidentId || !lease || lease.incidentId !== selectedEvent.incidentId || leaseBlocked) return;
    const startAt = new Date(maintenanceStartAt);
    const endAt = new Date(maintenanceEndAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      toast.error("Informe um período de manutenção válido.");
      return;
    }
    const reason = maintenanceNotes.trim();
    if (reason.length < 5) { toast.error("Informe o motivo obrigatório da manutenção (mínimo de 5 caracteres)."); return; }
    panelTransitionInFlightRef.current = true; setPanelTransitionBusy(true);
    try {
      const maintenanceResult = await startMaintenanceMut.mutateAsync({
        systemId: selectedSystem.id,
        incidentId: selectedEvent.incidentId,
        leaseToken: lease.leaseToken,
        startAt,
        endAt,
        notes: reason,
      });
      void maintenanceResult;
      setMaintenanceOpen(false);
      closePanelAfterAck();
      await Promise.all([utils.incident.openQueue.invalidate(), utils.alarmSystem.list.invalidate()]);
      toast.success("Sistema colocado em manutenção. Os novos eventos serão finalizados automaticamente no período informado.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível programar a manutenção.");
    } finally { panelTransitionInFlightRef.current = false; setPanelTransitionBusy(false); }
  }

  async function releaseMaintenance() {
    const lease = panelLeaseRef.current;
    if (!selectedEvent?.incidentId || !lease || !selectedSystem || !canOperateSelected || panelTransitionInFlightRef.current || finalizationInFlightRef.current || auditActionInFlight.current || failedAuditAction) return;
    panelTransitionInFlightRef.current = true; setPanelTransitionBusy(true);
    try {
      await endMaintenanceMut.mutateAsync({ systemId: selectedSystem.id, incidentId: selectedEvent.incidentId, leaseToken: lease.leaseToken });
      // Retirar a manutenção não finaliza a ocorrência.
      setSelectedEvent(previous => previous && lease && previous.incidentId === lease.incidentId ? { ...previous, queueStatus: "attending" } : previous);
      await Promise.all([utils.incident.openQueue.invalidate(), utils.alarmSystem.list.invalidate()]);
      toast.success("Sistema retirado da manutenção. Os próximos eventos voltarão a exigir atendimento.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível retirar a manutenção.");
    } finally { panelTransitionInFlightRef.current = false; setPanelTransitionBusy(false); }
  }

  // Buscar câmeras do cliente selecionado
  const { data: clientCameras } = trpc.camera.list.useQuery(
    { clientId: selectedClient?.id || 0 },
    { enabled: !!selectedClient?.id }
  );

  // Finalizar evento - salvar ocorrência no banco
  const finalizeEvent = useCallback((ev: QueueEvent) => {
    const lease = panelLeaseRef.current;
    if (!ev.incidentId || !lease || lease.incidentId !== ev.incidentId || leaseBlocked) { toast.warning("Abra ou assuma o painel exclusivo antes de finalizar esta ocorrência."); return; }
    if (finalizationInFlightRef.current || panelTransitionInFlightRef.current || createOccurrenceMut.isPending) {
      toast.info("A finalização já foi enviada. Aguarde a resposta antes de tentar novamente.");
      return;
    }
    if (auditActionInFlight.current || failedAuditAction) {
      toast.error("Aguarde ou tente gravar o registro de auditoria pendente antes de finalizar.");
      return;
    }
    if (!attendingNotes.trim()) {
      toast.error("Preencha a descrição da finalização antes de finalizar!");
      return;
    }
    const finalLogs = [`[${new Date().toLocaleTimeString("pt-BR")}] Evento FINALIZADO`, ...logs];
    const attendingTime = Date.now() - attendStartTime;
    const finalObservations = attendingNotes.trim();
    finalizationInFlightRef.current = true;
    createOccurrenceMut.mutate({
      leaseToken: lease.leaseToken,
      incidentId: ev.incidentId || undefined,
      account: ev.account,
      eventCode: ev.eventCode,
      qualifier: ev.qualifier || undefined,
      partition: ev.partition || undefined,
      zoneUser: ev.zoneUser || undefined,
      description: ev.description || undefined,
      priority: ev.priority || undefined,
      brand: ev.brand || ev.systemModel || undefined,
      clientId: selectedClient?.id || undefined,
      clientName: ev.clientName || undefined,
      systemId: selectedSystem?.id || undefined,
      partnerCompanyId: (selectedClient as any)?.partnerCompanyId || undefined,
      operatorId: user?.id || undefined,
      operatorName: user?.name || undefined,
      observations: finalObservations || undefined,
      logs: JSON.stringify(finalLogs),
      attendingTimeMs: attendingTime,
      sendEmail: sendEmail,
      sendPush: sendPush,
      startedAt: new Date(attendStartTime),
    }, {
      onSuccess: () => {
        void utils.incident.openQueue.invalidate();
        void utils.incident.auditTrail.invalidate({ incidentId: ev.incidentId });
        setQueues((prev) => prev.filter((q) => ev.incidentId ? q.incidentId !== ev.incidentId : q.id !== ev.id));
        const selected = selectedEventRef.current;
        const sameIncident = ev.incidentId != null ? selected?.incidentId === ev.incidentId : selected?.id === ev.id;
        if (sameIncident) {
          selectedEventRef.current = null;
          panelLeaseRef.current = null;
          setPanelLease(null);
          setSelectedEvent(null);
          setLeaseBlocked(false);
          setAttendingNotes("");
          setLogs([]);
          setSendEmail(false);
          setSendPush(false);
        }
        toast.success("Ocorrência finalizada e salva no banco!");
      },
      onError: (err: any) => {
        toast.error("Erro ao salvar ocorrência: " + err.message);
      },
      onSettled: () => { finalizationInFlightRef.current = false; },
    });
  }, [logs, attendStartTime, attendingNotes, selectedClient, selectedSystem, user, sendEmail, sendPush, utils, recordAuditActionMut.isPending, failedAuditAction, createOccurrenceMut.isPending, leaseBlocked]);

  const finalizeSameClientEvents = async (ev: QueueEvent) => {
    const lease = panelLeaseRef.current;
    if (!ev.incidentId || !lease || lease.incidentId !== ev.incidentId || leaseBlocked) { toast.warning("Abra ou assuma o painel exclusivo antes de finalizar em massa."); return; }
    if (finalizationInFlightRef.current || panelTransitionInFlightRef.current || bulkFinalizeMut.isPending) {
      toast.info("A finalização está em andamento. Aguarde a resposta antes de tentar novamente.");
      return;
    }
    if (auditActionInFlight.current || failedAuditAction) {
      toast.error("Conclua a gravação de auditoria pendente antes de finalizar em massa.");
      return;
    }
    if (!attendingNotes.trim()) {
      toast.error("Preencha a descrição antes de finalizar os eventos em massa!");
      return;
    }
    if (!bulkPreview || isBulkPreviewFetching || bulkPreviewError || bulkPreview.eligibleIncidentIds.length === 0) {
      toast.info("Atualize o lote para conferir os atendimentos elegíveis antes de confirmar.");
      return;
    }

    finalizationInFlightRef.current = true;
    try {
      const result = await bulkFinalizeMut.mutateAsync({
        account: ev.account,
        alarmSystemId: ev.alarmSystemId || ev.incidentSystemId || undefined,
        clientId: selectedClient?.id || undefined,
        clientName: selectedClient?.name || ev.clientName || undefined,
        partnerCompanyId: (selectedClient as any)?.partnerCompanyId || undefined,
        observations: attendingNotes,
        confirmedIncidentIds: bulkPreview.eligibleIncidentIds,
        currentIncidentId: ev.incidentId,
        leaseToken: lease.leaseToken,
      });
      if (result.count !== bulkPreview.eligibleIncidentIds.length || result.closedIncidentIds.length !== result.count || !isConfirmedBulkSetEligible(bulkPreview.eligibleIncidentIds, result.closedIncidentIds)) {
        toast.error("O resultado do servidor não corresponde ao lote confirmado. Confira a fila antes de repetir a operação.");
        await Promise.all([utils.incident.openQueue.invalidate(), refreshBulkPreview()]);
        return;
      }
      const closedIds = new Set(result.closedIncidentIds);
      setQueues((previous) => previous.filter((item) => !item.incidentId || !closedIds.has(item.incidentId)));
      if (ev.incidentId && closedIds.has(ev.incidentId)) {
        selectedEventRef.current = null;
        panelLeaseRef.current = null;
        setPanelLease(null);
        setSelectedEvent(null);
        setLeaseBlocked(false);
        setAttendingNotes("");
        setLogs([]);
        setSendEmail(false);
        setSendPush(false);
      }
      setBulkFinalizeOpen(false);
      const feedback = getBulkFinalizationFeedback(result, ev.account);
      if (feedback.type === "success") toast.success(feedback.message);
      else if (feedback.type === "warning") toast.warning(feedback.message);
      else toast.info(feedback.message);
      await Promise.all([utils.incident.openQueue.invalidate(), utils.incident.history.invalidate(), utils.occurrence.list.invalidate()]);
    } catch (error: any) {
      toast.error("Não foi possível finalizar todos os eventos: " + error.message);
      await Promise.all([utils.incident.openQueue.invalidate(), refreshBulkPreview()]);
    } finally {
      finalizationInFlightRef.current = false;
    }
  };

  async function createManualOccurrence() {
    if (!manualDescription.trim()) {
      toast.error("Informe a descrição da ocorrência manual.");
      return;
    }
    const { system, client } = manualAccountMatch;
    const now = Date.now();
    try {
      const saved = await createManualEventMut.mutateAsync({
        account: manualAccount || "0000",
        alarmSystemId: system?.id,
        clientId: client?.id,
        brand: system?.brand || "MANUAL",
        description: manualDescription.trim(),
        priority: manualPriority,
        receiverPort: system?.receiverPort || undefined,
      });
      const event: QueueEvent = {
      id: saved.id || now,
      incidentId: saved.incidentId,
      account: saved.account || manualAccount || "0000",
      brand: saved.brand || system?.brand || "MANUAL",
      qualifier: "E",
      eventCode: "MANUAL",
      partition: "",
      zoneUser: "",
      description: manualDescription.trim(),
      priority: manualPriority,
      remoteIp: "",
      receiverPort: system?.receiverPort || 0,
      timestamp: new Date(now).toISOString(),
      alarmSystemId: saved.alarmSystemId || system?.id || undefined,
      clientId: saved.clientId || client?.id || undefined,
      clientName: saved.clientName || (client ? (client.fantasyName || client.name) : (manualAccount ? `CONTA NÃO CADASTRADA (${manualAccount})` : "CONTA DO SISTEMA (0000)")),
      systemModel: system ? `${system.brand} ${system.model || ""}`.trim() : "OCORRÊNCIA MANUAL",
      queueStatus: "waiting",
      queuedAt: now,
    };
      setQueues((previous) => [event, ...previous]);
      setManualOccurrenceOpen(false);
      setManualAccount("");
      setManualDescription("");
      setManualPriority("medium");
      startAlertSound();
      toast.success("Ocorrência manual criada e salva na fila Aguardando.");
    } catch (error: any) {
      toast.error("Não foi possível criar a ocorrência manual: " + error.message);
    }
  }

  function requireSelectedPanelForOperationalAction(expectedIncidentId = selectedEvent?.incidentId) {
    const current = selectedEventRef.current;
    if (!current || current.incidentId !== expectedIncidentId) { toast.warning("Este atendimento já não está aberto nesta tela."); return false; }
    const lease = panelLeaseRef.current;
    if (!lease || lease.incidentId !== current.incidentId || leaseBlocked || panelTransitionInFlightRef.current || finalizationInFlightRef.current) {
      toast.warning("Este atendimento está somente para consulta. Abra ou assuma novamente antes de executar uma ação.");
      return false;
    }
    return true;
  }
  function openRemoteCommand(commandType: RemoteCommandType) {
    if (!requireSelectedPanelForOperationalAction()) return;
    if (!selectedEvent || !selectedRemoteSystemId || !selectedRemoteBrand) {
      toast.error("Comandos remotos em simulação estão disponíveis somente para centrais Compatec, Vetti e Intelbras identificadas.");
      return;
    }
    setRemoteCommandType(commandType);
    setRemoteCommandReason("");
    setRemoteCommandArmAuthorizationBasis("");
    setRemoteCommandZone(commandType === "isolate_zone" || commandType === "restore_zone"
      ? selectedRemoteBrand === "COMPATEC" ? "" : String(Number(selectedEvent.zoneUser || 0) || "")
      : "");
    setRemoteCommandPgm("");
    setRemoteCommandPartition("1");
    setRemoteCommandOpen(true);
  }

  function submitRemoteCommandSimulation() {
    if (!requireSelectedPanelForOperationalAction()) return;
    if (!selectedEvent || !selectedRemoteSystemId) return;
    const zoneNumber = Number(remoteCommandZone);
    const pgmNumber = Number(remoteCommandPgm);
    if ((remoteCommandType === "isolate_zone" || remoteCommandType === "restore_zone") && (!Number.isInteger(zoneNumber) || zoneNumber < 1)) {
      toast.error("Informe a zona a ser isolada ou restaurada.");
      return;
    }
    if (selectedRemoteBrand === "VETTI" && remoteCommandType === "restore_zone" && !isVetti24HourZone(treatmentZones.find((zone: any) => zone.zoneNumber === zoneNumber))) {
      toast.error("Na Vetti, Restaurar Zona é usado somente em zonas classificadas como 24 horas.");
      return;
    }
    if (remoteCommandType === "activate_pgm" && (!Number.isInteger(pgmNumber) || pgmNumber < 1)) {
      toast.error("Informe a PGM a ser acionada.");
      return;
    }

    const simulationReason = selectedRemoteBrand === "COMPATEC" && remoteCommandType === "arm"
      ? remoteCommandArmAuthorizationBasis ? getCompatecArmAuditReason(remoteCommandArmAuthorizationBasis) : ""
      : remoteCommandReason;
    if (!simulationReason.trim()) {
      toast.error(selectedRemoteBrand === "COMPATEC" && remoteCommandType === "arm"
        ? "Selecione a base autorizadora do Arme."
        : "Informe a descrição/motivo do comando.");
      return;
    }
    simulateRemoteCommandMut.mutate({
      alarmSystemId: selectedRemoteSystemId,
      incidentId: selectedEvent.incidentId,
      commandType: remoteCommandType,
      reason: simulationReason,
      zoneNumber: (remoteCommandType === "isolate_zone" || remoteCommandType === "restore_zone") ? zoneNumber : undefined,
      pgmNumber: remoteCommandType === "activate_pgm" ? pgmNumber : undefined,
    }, {
      onSuccess: () => {
        const summary = `${REMOTE_COMMAND_LABELS[remoteCommandType]} registrado em simulação`;
        addLog(summary);
        toast.success(`${summary}. Nenhum comando foi enviado à central.`);
        setRemoteCommandOpen(false);
        void utils.remoteCommand.list.invalidate({ alarmSystemId: selectedRemoteSystemId, limit: 8 });
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function submitIntelbrasPhysical(commandType: "arm" | "disarm") {
    if (!INTELBRAS_PHYSICAL_COMMAND_ENABLED) {
      toast.error(INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE);
      return;
    }
    if (!selectedEvent || !selectedRemoteSystemId || selectedRemoteBrand !== "INTELBRAS") return;
    if (remoteCommandReason.trim().length < 5) {
      toast.error("Informe o motivo operacional do comando físico.");
      return;
    }
    const actionLabel = commandType === "arm" ? "ARMAR" : "DESARMAR";
    const confirmed = window.confirm(
      `CONFIRMAR ${actionLabel} FÍSICO DA INTELBRAS?\n\nConta ${selectedEvent.account} · ${selectedEvent.systemModel}\nMAC ${selectedSystem?.macAddress || "não informado"}\nDescrição / motivo: ${remoteCommandReason.trim()}\n\nSequência autenticada: login 0x11, alternância 0x16, resposta de estado 0x96 e liberação do teclado 0x15/0x95. Se a sessão cair, não haverá reenvio tardio.`,
    );
    if (!confirmed) return;
    sendIntelbrasPhysicalMut.mutate({
      alarmSystemId: selectedRemoteSystemId,
      incidentId: selectedEvent.incidentId,
      commandType,
      reason: remoteCommandReason,
      partition: 0,
    }, {
      onSuccess: (result) => {
        addLog(`${actionLabel} físico Intelbras registrado; status ${result.status}.`);
        if (result.status === "failed") toast.error(result.message || `O comando ${actionLabel} falhou e não foi confirmado pela central.`);
        else toast.success(result.message || `Comando ${actionLabel} registrado.`);
        void utils.remoteCommand.list.invalidate({ alarmSystemId: selectedRemoteSystemId, limit: 8 });
      },
      onError: (error) => toast.error(error.message),
    });
  }
  function submitCompatecBenchStatusQuery() {
    if (!requireSelectedPanelForOperationalAction()) return;
    if (!selectedEvent?.alarmSystemId) return;
    if (remoteCommandReason.trim().length < 5) {
      toast.error("Informe o motivo operacional da consulta.");
      return;
    }
    queryBenchStatusMut.mutate({
      alarmSystemId: selectedEvent.alarmSystemId,
      incidentId: selectedEvent.incidentId,
      reason: remoteCommandReason,
    }, {
      onSuccess: (result) => {
        addLog("Consulta MicroBus MW1 registrada para a central de bancada.");
        toast.success(result.status === "sent" ? "Consulta MB=AK0 enviada. Aguarde a resposta da central." : result.message || "Consulta aguardando a conexão da central.");
        void utils.remoteCommand.list.invalidate({ alarmSystemId: selectedEvent.alarmSystemId, limit: 8 });
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function submitVettiBenchStatusQuery() {
    if (!selectedEvent?.alarmSystemId) return;
    if (remoteCommandReason.trim().length < 5) {
      toast.error("Informe o motivo operacional da consulta.");
      return;
    }
    if (!window.confirm(`Confirmar a consulta física de status da central Vetti de testes?\n\nDescrição / motivo: ${remoteCommandReason.trim()}\n\nNenhum Arme, Desarme, Zona ou PGM será enviado.`)) return;
    queryVettiBenchStatusMut.mutate({
      alarmSystemId: selectedEvent.alarmSystemId,
      incidentId: selectedEvent.incidentId,
      reason: remoteCommandReason,
    }, {
      onSuccess: (result) => {
        addLog("Consulta física VSec de status registrada para a central Vetti de testes.");
        toast.success(result.message || "Consulta VSec aguardando o próximo login autenticado da central.");
        void utils.remoteCommand.list.invalidate({ alarmSystemId: selectedEvent.alarmSystemId, limit: 8 });
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function submitVettiBenchDisarm() {
    if (!selectedEvent?.alarmSystemId) return;
    if (remoteCommandReason.trim().length < 5) {
      toast.error("Informe o motivo operacional do Desarme.");
      return;
    }
    if (!window.confirm(`Confirmar o DESARME FÍSICO da central Vetti de testes?\n\nDescrição / motivo: ${remoteCommandReason.trim()}\n\nNenhum outro sistema pode receber este comando.`)) return;
    disarmVettiBenchMut.mutate({
      alarmSystemId: selectedEvent.alarmSystemId,
      incidentId: selectedEvent.incidentId,
      reason: remoteCommandReason,
    }, {
      onSuccess: (result) => {
        addLog("Desarme físico VSec registrado para a central Vetti de testes; aguardando login e validação de estado.");
        toast.success(result.message || "Desarme VSec aguardando o próximo login autenticado da central.");
        void utils.remoteCommand.list.invalidate({ alarmSystemId: selectedEvent.alarmSystemId, limit: 8 });
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function submitCompatecBenchSectorsQuery() {
    if (!requireSelectedPanelForOperationalAction()) return;
    if (!selectedEvent?.alarmSystemId) return;
    if (remoteCommandReason.trim().length < 5) {
      toast.error("Informe o motivo operacional da consulta.");
      return;
    }
    queryBenchSectorsMut.mutate({
      alarmSystemId: selectedEvent.alarmSystemId,
      incidentId: selectedEvent.incidentId,
      reason: remoteCommandReason,
    }, {
      onSuccess: (result) => {
        addLog("Consulta MicroBus de setores registrada para a central de bancada.");
        toast.success(result.status === "sent" ? "Consulta MB=AK1 enviada. Aguarde a resposta dos setores." : result.message || "Consulta aguardando a conexão da central.");
        void utils.remoteCommand.list.invalidate({ alarmSystemId: selectedEvent.alarmSystemId, limit: 8 });
      },
      onError: (error) => toast.error(error.message),
    });
  }

  async function submitCompatecBenchArmAll() {
    if (!requireSelectedPanelForOperationalAction()) return;
    if (!selectedEvent?.alarmSystemId || selectedSystem?.brand !== "COMPATEC" || selectedSystem.isActive === false) return;
    if (!remoteCommandArmAuthorizationBasis) { toast.error("Selecione por que o Arme está autorizado nesta ocasião."); return; }
    const reason = getCompatecArmAuditReason(remoteCommandArmAuthorizationBasis);
    const physicalIdentifier = selectedSystem.macAddress || selectedSystem.serialNumber || selectedSystem.imeiGprs || selectedSystem.isepId;
    if (!physicalIdentifier || !selectedSystem.receiverPort) { toast.error("Arme bloqueado: confirme no cadastro a identidade física da central e sua porta do receptor."); return; }
    if (!window.confirm(`CONFIRMAR ARME TOTAL FÍSICO DA CENTRAL COMPATEC?\n\nConta ${selectedEvent.account} · ${selectedEvent.systemModel}\nBase autorizadora: ${reason}\n\nSerá enviado somente MB=AK4[4]. A configuração setorial é outra ação e usa AK2→AK1.`)) return;
    armCompatecAllMut.mutate({ alarmSystemId: selectedEvent.alarmSystemId, incidentId: selectedEvent.incidentId,
      authorizationBasis: remoteCommandArmAuthorizationBasis,
    }, {
      onSuccess: (result) => {
        addLog("Solicitação de Arme total AK4[4] registrada para a central Compatec.");
        if (["failed", "cancelled", "dispatch_unknown"].includes(result.status)) toast.error(result.message || "Confira o resultado do comando na central.");
        else toast.success(result.status === "sent" ? "Arme total AK4[4] enviado. Aguarde a resposta da central." : result.message || "Arme aguardando conexão.");
        void utils.remoteCommand.list.invalidate({ alarmSystemId: selectedEvent.alarmSystemId, limit: 8 });
      }, onError: (error) => toast.error(error.message),
    });
  }
  function submitCompatecBenchDisarmAll() {
    if (!selectedEvent?.alarmSystemId) return;
    if (remoteCommandReason.trim().length < 5) {
      toast.error("Informe o motivo operacional do Desarme.");
      return;
    }
    if (!window.confirm(`Confirmar o DESARME FÍSICO da central Compatec?\n\nDescrição / motivo: ${remoteCommandReason.trim()}\n\nEsta ação será entregue no próximo contato autenticado da central.`)) return;
    disarmBenchAllMut.mutate({
      alarmSystemId: selectedEvent.alarmSystemId,
      incidentId: selectedEvent.incidentId,
      reason: remoteCommandReason,
    }, {
      onSuccess: (result) => {
        addLog("Desarme físico MicroBus registrado para a central Compatec.");
        toast.success(result.status === "sent" ? "Desarme MB=AK4[12] enviado. Aguarde a confirmação da central." : result.message || "Desarme aguardando a conexão da central.");
        void utils.remoteCommand.list.invalidate({ alarmSystemId: selectedEvent.alarmSystemId, limit: 8 });
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function submitCompatecBenchDisarmQuick() {
    if (!requireSelectedPanelForOperationalAction()) return;
    if (!selectedEvent?.alarmSystemId || !selectedCompatecDisarmEnabled || selectedArmDisarmState !== "armed") {
      toast.error("O Desarme físico está disponível somente para uma central Compatec ativa e cadastrada.");
      return;
    }
    const reason = attendingNotes.trim() || `Desarme físico confirmado pelo operador durante o atendimento da conta ${selectedEvent.account}.`;
    const confirmed = window.confirm(
      `CONFIRMAR DESARME FÍSICO?\n\nConta ${selectedEvent.account} · ${selectedEvent.systemModel}\nMAC ${selectedSystem?.macAddress || "não informado"}\nDescrição / motivo: ${reason}\n\nEsta ação transmitirá o comando para esta central Compatec cadastrada.`,
    );
    if (!confirmed) return;
    disarmBenchAllMut.mutate({
      alarmSystemId: selectedEvent.alarmSystemId,
      incidentId: selectedEvent.incidentId,
      reason,
    }, {
      onSuccess: (result) => {
        addLog("Desarme físico MicroBus confirmado pelo operador.");
        toast.success(result.status === "sent" ? "DESARME enviado para a Compatec. Aguarde a confirmação da central." : result.message || "Desarme registrado e aguardando a conexão autenticada da central.");
        void utils.remoteCommand.list.invalidate({ alarmSystemId: selectedEvent.alarmSystemId, limit: 8 });
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function submitCompatecArmQuick() {
    if (!requireSelectedPanelForOperationalAction()) return;
    if (!selectedEvent?.alarmSystemId || !selectedCompatecDisarmEnabled || selectedArmDisarmState !== "disarmed") {
      toast.error("O Arme físico exige uma central Compatec ativa e com estado desarmado confirmado."); return;
    }
    openStandaloneCommandRequest({ ...selectedSystem, alarmSystemId: selectedEvent.alarmSystemId,
      incidentId: selectedEvent.incidentId, clientName: selectedEvent.clientName }, "arm");
  }
  function openStandaloneCommandRequest(item: any, commandType: "arm" | "disarm") {
    if (!isStandalonePhysicalCommandSupported(item?.brand)) {
      toast.error("O Arme e o Desarme sem ocorrência estão liberados somente para centrais Compatec homologadas.");
      return;
    }
    setStandaloneRemoteRequest({ ...item, commandType });
    setStandaloneRemoteReason("");
    setStandaloneArmAuthorizationBasis("");
    setStandaloneRemoteMode("total");
  }

  async function submitStandaloneCommandRequest() {
    if (!standaloneRemoteRequest) return;
    const systemId = Number(standaloneRemoteRequest.alarmSystemId || standaloneRemoteRequest.systemId || 0);
    const brand = String(standaloneRemoteRequest.brand || "").toUpperCase();
    const commandType = standaloneRemoteRequest.commandType;
    const system = (systemData || []).find((item: any) => item.id === systemId);
    const physicalIdentifier = system?.macAddress || system?.serialNumber || system?.imeiGprs || system?.isepId;
    const actionLabel = commandType === "arm" ? "ARMAR físico Compatec" : "DESARMAR físico Compatec";
    const reason = commandType === "arm"
      ? standaloneArmAuthorizationBasis ? getCompatecArmAuditReason(standaloneArmAuthorizationBasis) : ""
      : standaloneRemoteReason.trim();
    if (!systemId) {
      toast.error("A central não possui um identificador cadastrado para o comando.");
      return;
    }
    if (commandType === "arm" && !standaloneArmAuthorizationBasis) {
      toast.error("Selecione por que o Arme está autorizado nesta ocasião.");
      return;
    }
    if (commandType === "disarm" && reason.length < 5) {
      toast.error("Informe a descrição/motivo do Desarme.");
      return;
    }
    const auditReason = reason;
    if (brand !== "COMPATEC") {
      toast.error("O Arme e o Desarme sem ocorrência estão liberados somente para centrais Compatec homologadas.");
      return;
    }
    if (!physicalIdentifier || !system?.receiverPort) {
      toast.error("Comando bloqueado: confirme no cadastro a identidade física da central e a porta do receptor.");
      return;
    }
    if (!window.confirm(
      `CONFIRMAR ${actionLabel} SEM OCORRÊNCIA?\n\nConta ${standaloneRemoteRequest.account} · ${standaloneRemoteRequest.clientName || "Cliente"}\nCentral ${standaloneRemoteRequest.model || standaloneRemoteRequest.brand || "não informada"}\nIdentidade: ${physicalIdentifier} · Porta ${system.receiverPort}\n\n${commandType === "arm" ? `Base autorizadora: ${reason}` : `Descrição / motivo: ${reason}`}\n\nEsta é uma ação total independente. Configuração setorial usa AK2→AK1, sem AK4. O operador autenticado será registrado automaticamente.`,
    )) return;

    const onSuccess = (result: any) => {
      setStandaloneRemoteRequest(null);
      setArmDisarmModal(null);
      setStandaloneRemoteReason("");
      setStandaloneArmAuthorizationBasis("");
      void utils.dashboard.armDisarmStatus.invalidate();
      void utils.remoteCommand.list.invalidate({ alarmSystemId: systemId, limit: 8 });
      if (["failed", "cancelled", "dispatch_unknown"].includes(result?.status)) toast.error(result?.message || "Comando não concluído; confira o relatório e a central.");
      else toast.success(result?.status === "sent" ? `${actionLabel}: solicitação enviada. Aguarde o resultado da central.` : result?.message || `${actionLabel} registrado e aguardando conexão.`);
    };
    const onError = (error: any) => toast.error(error.message);

    if (commandType === "arm") {
      armCompatecAllMut.mutate({ alarmSystemId: systemId, incidentId: standaloneRemoteRequest.incidentId, authorizationBasis: standaloneArmAuthorizationBasis as CompatecArmAuthorizationBasis }, { onSuccess, onError });
    } else {
      disarmBenchAllMut.mutate({ alarmSystemId: systemId, reason: auditReason }, { onSuccess, onError });
    }
  }

  // Card do evento
  function EventCard({ ev, groupedCard = false }: { ev: QueueEvent; groupedCard?: boolean }) {
    const sameClientCount = countSameClient(ev);
    const pri = PRIORITY_LABELS[ev.priority] || PRIORITY_LABELS.medium;
    const eventTimestamp = ev.receivedAt || ev.timestamp;
    const eventDate = eventTimestamp ? new Date(eventTimestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
    const time = eventTimestamp ? new Date(eventTimestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
    const isNew = ev.queueStatus === "waiting" && Date.now() - ev.queuedAt < 90_000;
    const eventSystem = resolveQueueEventSystem(ev, systemData || []);
    const eventClient = resolveQueueEventClient(ev, eventSystem, clientData || []);
    const eventPartner = eventClient?.partnerCompanyId
      ? partnerCompanyData.find((partner: any) => partner.id === eventClient.partnerCompanyId)
      : null;
    const eventPanelUser = isPanelUserDisplayEvent(ev) && eventSystem
      ? operationalAlarmUsers.find((panelUser: any) => panelUser.alarmSystemId === eventSystem.id && Number(panelUser.userNumber) === Number(ev.zoneUser))
      : null;
    const panelUserDisplayText = getPanelUserDisplayText(ev, eventPanelUser);

    return (
      <div
        onClick={() => handleSelectEvent(ev)}
        className={`w-full min-w-0 rounded-md border border-border/50 px-3 py-2 cursor-pointer hover:bg-primary/10 transition-colors relative border-l-4 shadow-sm ${
          selectedEvent?.incidentId === ev.incidentId ? 'bg-primary/15 border-l-primary' : (PRIORITY_BORDER[ev.priority] || PRIORITY_BORDER.medium)
        }`}
      >
        {sameClientCount > 0 && !groupedCard && (
          <div title={`${sameClientCount + 1} atendimentos abertos desta central; a finalização confere os elegíveis no banco`} className="absolute top-2 right-2 h-5 w-5 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">{sameClientCount + 1}</span>
          </div>
        )}
        <div className="flex items-center gap-2 pr-8">
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono" title={eventTimestamp ? new Date(eventTimestamp).toLocaleString("pt-BR") : undefined}>
            <span>{time}</span>
            {eventDate && <><span aria-hidden="true" className="text-muted-foreground/60">·</span><span>{eventDate}</span></>}
          </div>
          {isNew && <Badge className="bg-red-600 px-1.5 py-0 text-[9px] font-bold text-white">NOVO</Badge>}
        </div>
        <div className={`mt-0.5 font-bold text-sm ${PRIORITY_TEXT_COLOR[ev.priority] || 'text-foreground'}`}>{ev.description || `Evento ${ev.eventCode}`}</div>
        <div className="mt-0.5 text-sm text-primary font-semibold"><span className="font-mono tracking-[0.12em]">{ev.account}</span> <span className="text-muted-foreground">·</span> {ev.clientName}</div>
        <div className="text-[11px] text-cyan-300/90 truncate">Parceira: {eventPartner?.name || "Sem empresa parceira vinculada"}</div>
        {panelUserDisplayText && <div className="text-[11px] text-blue-200 truncate">{panelUserDisplayText}</div>}
        <div className="text-[11px] text-muted-foreground truncate">Central: {ev.systemModel}</div>
        {ev.panelActive === true ? <div className="mt-1 text-[10px] font-extrabold uppercase text-amber-200">OCORRÊNCIA EM ATENDIMENTO POR {ev.panelOperatorName || "OUTRO OPERADOR"}</div>
          : ev.queueStatus !== "waiting" && <div className="mt-1 text-[10px] font-semibold text-sky-200">Pausada · último responsável: {ev.incidentOperatorName || "não informado"}{ev.pauseReason ? ` · Motivo: ${ev.pauseReason}` : ""}</div>}
        {ev.parentIncidentId && <div className="mt-1 text-[10px] text-amber-200">Atendimento independente #{ev.incidentId} · origem #{ev.parentIncidentId}</div>}
        <div className="flex items-center gap-2 mt-1">
          <span className="font-mono text-xs text-muted-foreground">{ev.qualifier === 'E' ? '' : 'R'}{ev.eventCode}</span>
          <Badge className={`text-[10px] px-1.5 py-0 ${pri.color}`}>{pri.label}</Badge>
        </div>
        {ev.observationUntil && ev.queueStatus === "observing" && <div className="mt-1 text-[10px] text-purple-300">Observação até {new Date(ev.observationUntil).toLocaleString("pt-BR")}</div>}
        {!ev.panelActive && ev.incidentId && ev.queueStatus !== "waiting" && ev.incidentOperatorId != null && ev.incidentOperatorId !== user?.id && <Button type="button" size="sm" variant="outline" className="mt-2 h-7 border-amber-500/50 px-2 text-[10px] text-amber-200" onClick={(event) => { event.stopPropagation(); void handleSelectEvent(ev, true); }} aria-label={`Assumir ocorrência ${ev.incidentId}`}>Assumir atendimento</Button>}
        {sameClientCount > 0 && !groupedCard && (
          <div className="text-[10px] text-cyan-400 mt-1">+ {sameClientCount} atendimentos desta central</div>
        )}
      </div>
    );
  }

  function QueueSection({ title, color, events }: { title: string; color: string; events: QueueEvent[] }) {
    return (
      <div className="mb-0.5">
        <div className={`px-3 py-1.5 font-bold text-sm ${color} border-b border-border/30 sticky top-0 bg-card z-10`}>
          {title} ({events.length})
        </div>
        {events.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground italic">Nenhuma ocorrência</div>
        ) : (
          <div className="space-y-1.5 px-2 py-2">{events.map((ev, idx) => <EventCard key={`${ev.account}-${ev.queuedAt}-${idx}`} ev={ev} />)}</div>
        )}
      </div>
    );
  }

  const occurrenceTreatmentPanel = selectedEvent && (
        <div data-testid="active-occurrence-inline" className="flex h-full min-h-0 min-w-0 w-full overflow-hidden border border-primary/35 bg-card">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card">
            <div className="flex items-start justify-between border-b border-border bg-card px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className={`mt-0.5 h-6 w-6 shrink-0 ${selectedEvent.qualifier === 'E' ? 'text-red-400' : 'text-green-400'}`} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Tratamento de ocorrência</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-lg font-bold tracking-[0.14em] text-green-400">Conta {selectedEvent.account}</span>
                    <span className="font-bold text-foreground">{selectedClient?.name || selectedEvent.clientName}</span>
                    {selectedClient?.fantasyName && <span className="text-cyan-400">· {selectedClient.fantasyName}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="text-cyan-200">Parceira responsável: <strong className="text-foreground">{selectedPartner?.name || "Sem empresa parceira vinculada"}</strong></span>
                    {selectedEvent.incidentOperatorName && <span className="text-sky-200">Responsável pelo atendimento: <strong className="text-foreground">{selectedEvent.incidentOperatorName}</strong></span>}
                    {selectedEvent.parentIncidentId && <span className="text-amber-200">Registro independente #{selectedEvent.incidentId} · origem #{selectedEvent.parentIncidentId}</span>}
                    {getPanelUserDisplayText(selectedEvent, selectedPanelUser) && <span className="text-blue-200"><strong className="text-foreground">{getPanelUserDisplayText(selectedEvent, selectedPanelUser)}</strong></span>}
                  </div>
                  <p className={`mt-1 font-bold text-lg ${PRIORITY_TEXT_COLOR[selectedEvent.priority] || 'text-foreground'}`}>{selectedEvent.qualifier}{selectedEvent.eventCode} - {selectedEvent.description}</p>
                  {selectedRemoteBrand === "VETTI" && selectedEvent.alarmSystemId && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {selectedArmDisarmState === "armed" ? (
                        <Button className="h-9 bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700" onClick={() => openRemoteCommand("disarm")}>DESARMAR</Button>
                      ) : selectedArmDisarmState === "disarmed" ? (
                        selectedEvent.brand === "COMPATEC" ? (
                          <Button className="h-9 bg-green-600 px-4 text-sm font-bold text-white hover:bg-green-700" onClick={() => openRemoteCommand("arm")}>ARMAR</Button>
                        ) : (
                          <Button className="h-9 bg-green-600 px-4 text-sm font-bold text-white hover:bg-green-700" disabled title="Arme remoto permanece bloqueado para esta marca até homologação física independente">ARMAR</Button>
                        )
                      ) : (
                        <Button className="h-9 px-4 text-sm font-bold" variant="outline" disabled>Estado não confirmado</Button>
                      )}
                      {selectedArmDisarmState === "disarmed" && selectedEvent.brand !== "COMPATEC" && <span className="text-xs text-muted-foreground">Arme remoto ainda não homologado.</span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                {selectedEvent.incidentId && <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 border-cyan-500/40 px-2.5 text-xs text-cyan-200 hover:bg-cyan-500/10 sm:px-3" onClick={() => setTreatmentPanel("events")} aria-label="Consultar últimos eventos do cliente"><History className="h-3.5 w-3.5" /><span>Eventos recentes</span></Button>}
                <WorkspaceScreenMenu label="Outras telas" className="hidden sm:inline-flex" />
                <div className="sm:hidden"><WorkspaceScreenMenu compact label="Abrir outra tela sem fechar este atendimento" /></div>
                <Timer startTime={attendStartTime} />
                <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={requestCloseAttendance} aria-label="Fechar tratamento"><X className="h-5 w-5" /></button>
              </div>
            </div>
            {panelWarning && <div role="alert" className="border-b border-amber-500/40 bg-amber-500/10 px-5 py-2 text-sm font-semibold text-amber-100">{panelWarning}</div>}
            {isOtherOperatorObservation ? (
              <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
                <div className="w-full max-w-xl rounded-xl border border-amber-400/50 bg-amber-400/5 p-6 text-center">
                  <Users className="mx-auto mb-3 h-10 w-10 text-amber-300" />
                  <h3 className="text-lg font-bold text-amber-100">Atendimento em observação</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Ocorrência pausada em {selectedEvent.queueStatus} com <strong className="text-foreground">{selectedEvent.incidentOperatorName || "outro operador"}</strong>. Status e motivo serão preservados ao abrir/assumir o painel; o histórico existente é preservado.</p>
                  {selectedEvent.pauseReason && <p className="mt-3 rounded bg-black/20 p-3 text-left text-sm text-amber-100">Motivo da pausa: {selectedEvent.pauseReason}</p>}
                  {selectedIncidentNotesForDisplay && <p className="mt-4 whitespace-pre-wrap rounded-md bg-black/20 p-3 text-left text-sm text-foreground">{selectedIncidentNotesForDisplay}</p>}
                  <Button className="mt-5 bg-amber-500 font-bold text-black hover:bg-amber-400" disabled={openPending} onClick={() => void assumeSelectedObservation()}>
                    <Users className="mr-2 h-4 w-4" />{openPending ? "Assumindo..." : "Assumir atendimento"}
                  </Button>
                </div>
              </div>
            ) : isOtherOperatorAttendance ? (
              <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
                <div className="w-full max-w-xl rounded-xl border border-sky-400/40 bg-sky-400/5 p-6 text-center">
                  <Users className="mx-auto mb-3 h-10 w-10 text-sky-300" />
                  <h3 className="text-lg font-bold text-sky-100">OCORRÊNCIA EM ATENDIMENTO POR {selectedEvent.panelOperatorName || "OUTRO OPERADOR"}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Esta ocorrência está em atendimento por <strong className="text-foreground">{selectedEvent.panelOperatorName || "outro operador"}</strong>. Você pode consultar contatos, notas e logs; controles operacionais ficam bloqueados até o lease ser liberado.</p>
                  {selectedIncidentNotesForDisplay && <p className="mt-4 whitespace-pre-wrap rounded-md bg-black/20 p-3 text-left text-sm text-foreground">{selectedIncidentNotesForDisplay}</p>}
                  {selectedEvent.pauseReason && <p className="mt-3 rounded bg-black/20 p-3 text-left text-sm text-amber-100">Motivo da pausa: {selectedEvent.pauseReason}</p>}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                {selectedEvent.queueStatus === "maintenance" && <div className="border-b border-yellow-500/40 bg-yellow-500/10 px-5 py-3 text-sm text-yellow-100"><strong>Sistema em manutenção.</strong> A ocorrência continua consultável, permite contatos, notas e finalização; retirar a manutenção do sistema é uma ação separada e não finaliza a ocorrência. {selectedEvent.pauseReason && <span className="block mt-1">Motivo: {selectedEvent.pauseReason}</span>}<Button className="mt-2 h-8 bg-red-600 hover:bg-red-700" onClick={() => void releaseMaintenance()} disabled={!canOperateSelected || endMaintenanceMut.isPending}><Wrench className="mr-2 h-4 w-4" />{endMaintenanceMut.isPending ? "Retirando..." : "Retirar manutenção do sistema"}</Button></div>}
                {selectedIncidentNotesForDisplay && <details className="shrink-0 border-b border-border bg-muted/20 px-5 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-sky-200">Registro anterior e transferência do atendimento</summary>
                  <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-sm text-foreground">{selectedIncidentNotesForDisplay}</p>
                </details>}
                {!canOperateSelected && <div role="status" className="border-b border-sky-500/30 bg-sky-500/5 px-5 py-2 text-xs text-sky-100">Modo consulta: nenhum controle operacional será enviado. Use Assumir atendimento se a ocorrência estiver pausada.</div>}
                {assumeAvailable && <div className="border-b border-amber-500/30 px-5 py-2"><Button size="sm" disabled={openPending} onClick={() => void assumeSelectedObservation()}><Users className="mr-2 h-4 w-4" />{openPending ? "Assumindo..." : "Assumir atendimento"}</Button></div>}
                <div className="grid gap-4 border-b border-border px-5 py-4 lg:grid-cols-[1fr_auto]">
                  <Textarea disabled={!canOperateSelected} className="min-h-[108px] resize-none text-sm" placeholder="Registro do atendimento, contatos realizados e providências..." value={attendingNotes} onChange={(event) => setAttendingNotes(event.target.value)} />
                  <div className="flex min-w-[180px] flex-col gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"><input type="checkbox" disabled={!canOperateSelected} className="h-3.5 w-3.5 rounded border-border" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} /><Mail className="h-3 w-3" /> E-mail</label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"><input type="checkbox" disabled={!canOperateSelected} className="h-3.5 w-3.5 rounded border-border" checked={sendPush} onChange={(event) => setSendPush(event.target.checked)} /><Send className="h-3 w-3" /> Push</label>
                    <Button size="sm" className="mt-auto bg-green-600 hover:bg-green-700" disabled={!canOperateSelected || createOccurrenceMut.isPending} onClick={() => finalizeEvent(selectedEvent)}>{createOccurrenceMut.isPending ? "Finalizando..." : "Finalizar"}</Button>
                    <Button size="sm" variant="outline" className="border-blue-500/50 text-blue-300 hover:bg-blue-500/10" disabled={!canOperateSelected} onClick={() => { setFinalizationSearch(""); setSelectedFinalization("open"); }}><FileText className="mr-1 h-3.5 w-3.5" /> Finalização Rápida</Button>
                    {selectedEvent.incidentId && countSameClient(selectedEvent) > 0 && <Button size="sm" variant="outline" className="border-orange-500/50 text-orange-400" disabled={!canOperateSelected} onClick={() => setBulkFinalizeOpen(true)}>Finalizar em massa</Button>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 border-b border-border px-5 py-2.5">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs" disabled={!canOperateSelected} onClick={openObservation}><Eye className="h-3.5 w-3.5" /> Observação</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setTreatmentPanel("cameras")}><Camera className="h-3.5 w-3.5" /> Câmeras</Button>
                  {selectedSystem?.id && <Button variant="outline" size="sm" className="gap-1.5 border-amber-500/40 text-xs text-amber-200" disabled={!canOperateSelected} onClick={() => setQuickScheduleSystem({ id: selectedSystem.id, account: selectedEvent.account, clientName: selectedClient?.fantasyName || selectedClient?.name || selectedEvent.clientName, brand: selectedSystem.brand, model: selectedSystem.model })}><CalendarClock className="h-3.5 w-3.5" /> Alterar agenda</Button>}
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-emerald-400" onClick={() => setTreatmentPanel("contacts")}><Phone className="h-3.5 w-3.5" /> Contatos ({treatmentContacts.length})</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-blue-400" onClick={() => setTreatmentPanel("users")}><Users className="h-3.5 w-3.5" /> Usuários ({treatmentAlarmUsers.length})</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-orange-400" disabled={!canOperateSelected} onClick={() => { setTacticalReason(""); setTacticalReasonOpen(true); }}><CarFront className="h-3.5 w-3.5" /> Tático</Button>
                  {!selectedSystemInMaintenance && <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-yellow-400" onClick={openMaintenance} disabled={!canOperateSelected}><Wrench className="h-3.5 w-3.5" /> Manutenção</Button>}
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-red-400" disabled={!canOperateSelected || recordAuditActionMut.isPending} onClick={async () => { if (await recordAuditAction({ action: "police_action_registered" })) toast.info("Acionamento manual da Polícia registrado; o sistema não realiza ligação."); }}><Shield className="h-3.5 w-3.5" /> Polícia</Button>
                  {selectedCompatecAction === "arm" ? (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-emerald-500/50 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-300 shadow-none hover:bg-emerald-500/20" onClick={submitCompatecArmQuick} disabled={!canOperateSelected || armCompatecAllMut.isPending} aria-label="Arme físico da central Compatec">
                      <Shield className="h-3.5 w-3.5" /> {armCompatecAllMut.isPending ? "ENVIANDO..." : "ARMAR"}
                    </Button>
                  ) : selectedCompatecAction === "disarm" ? (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-red-500/50 bg-red-500/10 px-2.5 text-xs font-semibold text-red-300 shadow-none hover:bg-red-500/20" onClick={submitCompatecBenchDisarmQuick} disabled={!canOperateSelected || disarmBenchAllMut.isPending} aria-label="Desarme físico da central Compatec">
                      <Shield className="h-3.5 w-3.5" /> {disarmBenchAllMut.isPending ? "ENVIANDO..." : "DESARME"}
                    </Button>
                  ) : selectedCompatecDisarmEnabled ? (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-amber-500/50 bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-300 shadow-none" disabled aria-label="Estado da central Compatec não confirmado">
                      <Shield className="h-3.5 w-3.5" /> ESTADO NÃO CONFIRMADO
                    </Button>
                  ) : selectedIntelbrasAction === "arm" ? (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-emerald-500/50 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-300 shadow-none hover:bg-emerald-500/20" disabled={!canOperateSelected} onClick={() => openRemoteCommand("arm")} aria-label="Arme físico da central Intelbras AMT-8000">
                      <Shield className="h-3.5 w-3.5" /> ARMAR
                    </Button>
                  ) : selectedIntelbrasAction === "disarm" ? (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-red-500/50 bg-red-500/10 px-2.5 text-xs font-semibold text-red-300 shadow-none hover:bg-red-500/20" disabled={!canOperateSelected} onClick={() => openRemoteCommand("disarm")} aria-label="Desarme físico da central Intelbras AMT-8000">
                      <Shield className="h-3.5 w-3.5" /> DESARME
                    </Button>
                  ) : selectedIntelbrasPhysicalEnabled ? (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-amber-500/50 bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-300 shadow-none" disabled aria-label="Estado da central Intelbras não confirmado">
                      <Shield className="h-3.5 w-3.5" /> COMANDO FÍSICO BLOQUEADO
                    </Button>
                  ) : selectedRemoteSystemId && selectedRemoteBrand ? (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-cyan-300" disabled={!canOperateSelected} onClick={() => openRemoteCommand("arm")}><Shield className="h-3.5 w-3.5" /> Comandos {selectedRemoteBrand === "VETTI" ? "Vetti" : selectedRemoteBrand === "INTELBRAS" ? "Intelbras" : "Compatec"}</Button>
	                  ) : (
	                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={() => toast.info("Comandos remotos dependem do protocolo homologado para cada fabricante.")}><Ban className="h-3.5 w-3.5" /> Isolar Zona</Button>
	                  )}
	                </div>
                <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[0.82fr_1.18fr]">
                  <div className="space-y-4">
                    {selectedRemoteBrand === "COMPATEC" && selectedRemoteSystemId && selectedEvent.incidentId ? <fieldset disabled={!canOperateSelected}><CompatecZoneConfigurationPanel alarmSystemId={selectedRemoteSystemId} incidentId={selectedEvent.incidentId} leaseToken={panelLease?.leaseToken} account={selectedEvent.account} model={selectedSystem?.model || selectedEvent.systemModel} macAddress={selectedSystem?.macAddress} imeiGprs={selectedSystem?.imeiGprs} receiverPort={selectedSystem?.receiverPort || selectedEvent.receiverPort} canOperate={canOperateSelected && Boolean(panelLease?.leaseToken)} /></fieldset> : (<div className="rounded-lg border border-red-500/25 bg-red-500/5 p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-red-100"><MapPin className="h-4 w-4 text-red-400" /> Zonas e setores</h3><div className="max-h-48 space-y-1.5 overflow-y-auto">{treatmentZones.filter((zone: any) => zone.isActive !== false).map((zone: any) => <div key={zone.id} className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs ${String(zone.zoneNumber) === String(selectedEvent.zoneUser).replace(/^0+/, "") ? "bg-red-500/15 text-red-100" : "bg-black/20 text-muted-foreground"}`}><span><strong className="font-mono">Zona {String(zone.zoneNumber).padStart(3, "0")}</strong> · {zone.name}</span><span className="uppercase text-[10px]">{zone.type}</span></div>)}{treatmentZones.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma zona cadastrada neste sistema.</p>}</div></div>)}
                    <div className="rounded-lg border border-border bg-black/15 p-4"><h3 className="mb-3 text-sm font-bold text-foreground">Dados do sistema</h3><div className="grid gap-1 text-sm text-muted-foreground"><p>Central: <span className="text-foreground">{selectedEvent.systemModel}</span></p><p>Porta: <span className="font-mono text-foreground">{selectedEvent.receiverPort || "Não informada"}</span></p><p>Detalhe do evento: <span className="font-mono text-foreground">{selectedEventArgument}</span></p><p>Prioridade: <span className={PRIORITY_TEXT_COLOR[selectedEvent.priority] || "text-foreground"}>{PRIORITY_LABELS[selectedEvent.priority]?.label || "Média"}</span></p></div></div>
                  </div>
                  <div className="space-y-3">
                    <OperationalProcedurePanel clientIdentified={!!selectedClient?.id} eventType={treatmentProcedureData?.eventType} procedures={treatmentProcedures} hasSpecificProcedure={treatmentProcedureData?.hasSpecificProcedure} isLoading={treatmentProcedureQuery.isLoading} error={treatmentProcedureQuery.error} onRetry={() => void treatmentProcedureQuery.refetch()} onViewAll={() => setShowProceduresModal(true)} />
                    {selectedEvent.queueStatus === "tactical" && <div className="rounded-lg border border-orange-400/40 bg-orange-500/5 p-3"><label className="text-sm font-semibold text-foreground" htmlFor="patrol-audit-status">Atualizar status informado do patrulheiro</label><select id="patrol-audit-status" value="" disabled={!canOperateSelected || recordAuditActionMut.isPending} onChange={(event) => void recordAuditAction({ action: "tactical_status_updated", tacticalStatus: event.target.value as "en_route" | "arrived" | "inspection" | "completed" })} className="mt-2 w-full rounded-md border border-input bg-background p-2 text-sm"><option value="">Registrar atualização…</option><option value="en_route">Em deslocamento</option><option value="arrived">Chegou ao local</option><option value="inspection">Em verificação</option><option value="completed">Verificação concluída</option></select><p className="mt-1 text-xs text-foreground">Registro manual informado pelo operador; não é localização ou status automático da viatura.</p></div>}


                    <details className="rounded-lg border border-border bg-black/15 p-3"><summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Registros deste atendimento — não são o protocolo</summary><div className="mt-3 space-y-2">{attendingNotes.trim() && <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3"><p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Registro em andamento</p><p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{attendingNotes}</p></div>}{logs.slice(-3).map((log, index) => <p key={index} className="rounded bg-black/20 px-3 py-2 font-mono text-xs text-muted-foreground">{log}</p>)}</div></details>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
  );

  return (
    <DashboardLayout>
      <audio ref={audioRef} preload="auto" loop src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" />

      {/* Popup de Ocorrências Pendentes (a cada 20 min) */}
      {pendingPopup && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center animate-pulse" onClick={closePendingPopup}>
          <div className="bg-red-900/95 border-2 border-red-500 rounded-lg p-6 w-[500px] max-h-[60vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-red-300 flex items-center gap-2">
                <Bell className="h-6 w-6 animate-bounce" /> OCORRÊNCIAS PENDENTES ({queues.filter(q => q.queueStatus === 'waiting').length})
              </h3>
              <button onClick={closePendingPopup} className="text-white hover:text-red-300">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-2">
              {queues.filter(q => q.queueStatus === 'waiting').map((ev, idx) => (
                <div key={idx} className="bg-black/40 border border-red-500/30 rounded px-3 py-2 cursor-pointer hover:bg-red-800/30" onClick={() => { closePendingPopup(); handleSelectEvent(ev); }}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-white">{ev.description || 'EVENTO NÃO CADASTRADO'}</span>
                    <span className="text-xs text-red-300">{new Date(ev.queuedAt).toLocaleTimeString('pt-BR')}</span>
                  </div>
                  <div className="text-xs text-red-200">{ev.account} - {ev.clientName}</div>
                </div>
              ))}
            </div>
            <p className="text-center text-red-300 text-sm mt-4">Clique para fechar ou atender um evento</p>
          </div>
        </div>
      )}

      {expandedCam && <CameraModal
        cam={expandedCam}
        onClose={() => setExpandedCam(null)}
        url={clientCameras?.[expandedCam - 1]?.rtspUrl || undefined}
        label={clientCameras?.[expandedCam - 1]?.name || `Câmera ${expandedCam}`}
      />}



      {remoteCommandOpen && selectedEvent && selectedRemoteSystemId && (
        <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/75 p-2 sm:items-center sm:p-5" onClick={() => !simulateRemoteCommandMut.isPending && setRemoteCommandOpen(false)}>
          <div className="flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-t-xl border border-cyan-400/35 bg-card shadow-2xl sm:max-h-[90dvh] sm:w-[min(760px,96vw)] sm:rounded-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-cyan-400/25 bg-cyan-400/5 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">{selectedRemoteBrand === "VETTI" ? "Comando remoto Vetti VSec · simulações e controle físico de bancada" : selectedRemoteBrand === "INTELBRAS" ? "Comando remoto Intelbras AMT-8000 · simulação" : "Comando remoto Compatec · Arme/Desarme total físicos"}</p>
                <h3 className="mt-1 text-lg font-bold text-foreground">Conta {selectedEvent.account} · {selectedEvent.systemModel}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{selectedRemoteBrand === "VETTI" ? "Simulados: Arme, Zona e PGM. Físicos controlados: consulta 0x14 e Desarme 0x43, exclusivamente na bancada Vetti autorizada." : selectedRemoteBrand === "INTELBRAS" ? "A simulação não transmite. O comando físico está temporariamente bloqueado: o fluxo implementado usa uma credencial de programação, mas Arme/Desarme deve usar a Senha Master (ou usuário permitido) no protocolo da central." : "Arme/Desarme total continuam em ações separadas AK4[4]/AK4[12]. Configuração de vários setores por AK2→AK1 está no painel do atendimento; espera KA1, não envia AK4 e não afirma o estado final. A sessão usa identidade física cadastrada e porta do receptor."}</p>
              </div>
              <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setRemoteCommandOpen(false)} aria-label="Fechar comando remoto"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[0.92fr_1.08fr] lg:gap-5">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(REMOTE_COMMAND_LABELS) as RemoteCommandType[]).filter((command) => selectedRemoteBrand === "COMPATEC" ? command === "arm" || command === "disarm" : selectedRemoteBrand === "INTELBRAS" ? command === "arm" || command === "disarm" : selectedRemoteBrand !== "VETTI" || command !== "restore_zone" || vettiTwentyFourHourZones.length > 0).map((command) => <Button key={command} type="button" variant={remoteCommandType === command ? "default" : "outline"} className="h-auto min-h-11 justify-start whitespace-normal text-left text-xs" onClick={() => setRemoteCommandType(command)}>{REMOTE_COMMAND_LABELS[command]}</Button>)}
                </div>
                {(remoteCommandType === "isolate_zone" || remoteCommandType === "restore_zone") && <label className="block text-sm font-medium text-foreground">{selectedRemoteBrand === "VETTI" && remoteCommandType === "restore_zone" ? "Zona 24 horas" : "Zona"}{selectedRemoteBrand === "VETTI" && remoteCommandType === "restore_zone" ? <select value={remoteCommandZone} onChange={(event) => setRemoteCommandZone(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione a zona 24 horas</option>{vettiTwentyFourHourZones.map((zone: any) => <option key={zone.id} value={zone.zoneNumber}>Zona {zone.zoneNumber} · {zone.name}</option>)}</select> : selectedRemoteBrand === "COMPATEC" ? <select value={remoteCommandZone} onChange={(event) => setRemoteCommandZone(event.target.value)} disabled={remoteCompatecZonesLoading} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">{remoteCompatecZonesLoading ? "Carregando zonas..." : "Selecione uma zona ativa cadastrada"}</option>{remoteCompatecZones.filter((zone: any) => zone.isActive && zone.zoneNumber >= 1 && zone.zoneNumber <= 23).map((zone: any) => <option key={zone.id} value={zone.zoneNumber}>Zona {zone.zoneNumber} · {zone.name}</option>)}</select> : <input type="number" min="1" max={selectedRemoteBrand === "VETTI" ? "511" : "10"} value={remoteCommandZone} onChange={(event) => setRemoteCommandZone(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={selectedRemoteBrand === "VETTI" ? "De 1 a 511" : "De 1 a 10"} />}</label>}
                {selectedRemoteBrand === "COMPATEC" && (remoteCommandType === "isolate_zone" || remoteCommandType === "restore_zone") && !remoteCompatecZonesLoading && remoteCompatecZones.filter((zone: any) => zone.isActive && zone.zoneNumber >= 1 && zone.zoneNumber <= 23).length === 0 && <p className="-mt-2 text-xs text-amber-100">Não há zonas ativas (1–23) cadastradas para esta central. Nenhum comando físico será habilitado.</p>}
                {selectedRemoteBrand === "VETTI" && <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">Para zona comum: desarme, isole e arme novamente; o próximo Desarme a restaura. <strong className="text-amber-200">Restaurar Zona</strong> só é exibido para zonas 24 horas.</p>}
                {remoteCommandType === "activate_pgm" && <label className="block text-sm font-medium text-foreground">PGM <select value={remoteCommandPgm} onChange={(event) => setRemoteCommandPgm(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione a PGM</option>{remoteCommandPgms.map((pgm: any) => <option key={pgm.id} value={pgm.pgmNumber}>PGM {pgm.pgmNumber} · {pgm.name}</option>)}{remoteCommandPgms.length === 0 && Array.from({ length: selectedRemoteBrand === "VETTI" ? 32 : 16 }, (_, index) => <option key={index + 1} value={index + 1}>PGM {index + 1}</option>)}</select></label>}
                {selectedRemoteBrand === "COMPATEC" && remoteCommandType === "arm" ? <label className="block text-sm font-medium text-foreground">Base autorizadora do Arme
                  <select aria-label="Base autorizadora do Arme" value={remoteCommandArmAuthorizationBasis} onChange={(event) => setRemoteCommandArmAuthorizationBasis(event.target.value as CompatecArmAuthorizationBasis | "")} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Selecione…</option>
                    {getCompatecArmAuthorizationOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label> : <label className="block text-sm font-medium text-foreground">Descrição / motivo <Textarea className="mt-1 min-h-24" value={remoteCommandReason} onChange={(event) => setRemoteCommandReason(event.target.value)} placeholder="Ex.: cliente confirmou a solicitação por telefone." /></label>}
                <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs leading-relaxed text-cyan-50"><strong>Auditoria automática:</strong> operador, base quando aplicável e resposta da central ficam registrados. Não é necessário digitar solicitante ou descrição para Arme. {selectedRemoteBrand === "COMPATEC" && (remoteCommandType === "isolate_zone" || remoteCommandType === "restore_zone") ? "KA1 informa recebimento, não confirma o estado final do bypass." : "Os comandos físicos mantêm as validações e confirmações do protocolo."}</div>
                {!(selectedRemoteBrand === "COMPATEC" && (remoteCommandType === "isolate_zone" || remoteCommandType === "restore_zone")) && <Button className="w-full bg-cyan-600 text-white hover:bg-cyan-700" disabled={simulateRemoteCommandMut.isPending || (selectedRemoteBrand === "COMPATEC" && remoteCommandType === "arm" ? !remoteCommandArmAuthorizationBasis : remoteCommandReason.trim().length < 5)} onClick={submitRemoteCommandSimulation}>{simulateRemoteCommandMut.isPending ? "Registrando..." : `Confirmar simulação: ${REMOTE_COMMAND_LABELS[remoteCommandType]}`}</Button>}
                {selectedRemoteBrand === "COMPATEC" && <p className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs leading-relaxed text-cyan-50">A configuração de setores fica no painel central desta ocorrência. Ela permite alterar vários setores em uma solicitação AK2→AK1; KA1 é somente recebimento e nenhum AK4 é enviado.</p>}
                {selectedRemoteBrand === "COMPATEC" && remoteCommandType === "arm" && <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3"><label className="block text-sm font-medium text-foreground">Preparação do futuro Arme por partição / Stay<select value={remoteCommandPartition} onChange={(event) => setRemoteCommandPartition(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="1">Partição 1</option><option value="2">Partição 2</option><option value="3">Partição 3</option></select></label><Button type="button" variant="outline" className="mt-2 w-full" disabled>Arme por partição indisponível até homologação Compatec</Button><p className="mt-2 text-xs leading-relaxed text-amber-100">A Compatec informou que ainda não identifica o estado individual das partições. Os comandos AK4[9–11] são toggle; não serão enviados para evitar armar/desarmar sem saber o estado real.</p></div>}
                {selectedRemoteBrand === "COMPATEC" && <><Button className="w-full border border-emerald-400/60 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25" disabled={selectedSystem?.brand !== "COMPATEC" || selectedSystem.isActive === false || armCompatecAllMut.isPending || !remoteCommandArmAuthorizationBasis} onClick={submitCompatecBenchArmAll}>{armCompatecAllMut.isPending ? "Enviando Arme..." : "Armar central Compatec (MB=AK4[4])"}</Button><Button className="w-full border border-orange-400/50 bg-orange-500/10 text-orange-100 hover:bg-orange-500/20" disabled={!selectedSystem?.remoteCommandLabEnabled || queryBenchStatusMut.isPending || remoteCommandReason.trim().length < 5} onClick={submitCompatecBenchStatusQuery}>{queryBenchStatusMut.isPending ? "Enviando consulta..." : "Consultar central de bancada (MB=AK0)"}</Button><Button className="w-full border border-violet-400/50 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20" disabled={!selectedSystem?.remoteCommandLabEnabled || queryBenchSectorsMut.isPending || remoteCommandReason.trim().length < 5} onClick={submitCompatecBenchSectorsQuery}>{queryBenchSectorsMut.isPending ? "Consultando setores..." : "Consultar setores da bancada (MB=AK1)"}</Button><Button className="w-full border border-red-400/60 bg-red-500/15 text-red-50 hover:bg-red-500/25" disabled={disarmBenchAllMut.isPending || remoteCommandReason.trim().length < 5} onClick={submitCompatecBenchDisarmAll}>{disarmBenchAllMut.isPending ? "Enviando Desarme..." : "Desarmar central Compatec (MB=AK4[12])"}</Button><p className="text-center text-[11px] text-muted-foreground">O Arme só é habilitado após a seleção de uma das bases permitidas; o Desarme conserva o campo de descrição. Inibir/Restaurar Zona utiliza somente AK2→AK1. KA1 informa recebimento, não o estado final.</p></>}
                {selectedRemoteBrand === "VETTI" && <><Button className="w-full border border-orange-400/50 bg-orange-500/10 text-orange-100 hover:bg-orange-500/20" disabled={queryVettiBenchStatusMut.isPending || remoteCommandReason.trim().length < 5} onClick={submitVettiBenchStatusQuery}>{queryVettiBenchStatusMut.isPending ? "Enviando consulta..." : "Consultar status da central de testes (VSec 0x14)"}</Button><Button className="w-full border border-red-400/60 bg-red-500/15 text-red-50 hover:bg-red-500/25" disabled={disarmVettiBenchMut.isPending || remoteCommandReason.trim().length < 5} onClick={submitVettiBenchDisarm}>{disarmVettiBenchMut.isPending ? "Enviando Desarme..." : "Desarmar central de testes (VSec 0x43)"}</Button><p className="text-center text-[11px] text-muted-foreground">Na bancada Vetti 0336, a consulta `0x14` e o Desarme `0x43` exigem modo de bancada ativo, login remoto, auditoria e resposta da central. Arme, Zona e PGM continuam somente em simulação.</p></>}
                {selectedRemoteBrand === "INTELBRAS" && <div className="space-y-2">
                  <div role="alert" className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-center text-xs leading-relaxed text-amber-100">{INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE} A Senha Master é diferente da senha de configuração/acesso remoto.</div>
                  {INTELBRAS_PHYSICAL_COMMAND_ENABLED && !selectedIntelbrasPhysicalEnabled && <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-center text-xs text-amber-100">O comando físico está disponível somente para uma AMT-8000 ativa com MAC cadastrado.</div>}
                  {INTELBRAS_PHYSICAL_COMMAND_ENABLED && selectedIntelbrasPhysicalEnabled && !selectedIntelbrasBenchEnabled && <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-center text-xs text-amber-100">Comandos bloqueados. Um administrador deve habilitar a bancada AMT-8000 no cadastro desta central.</div>}
                  {INTELBRAS_PHYSICAL_COMMAND_ENABLED && selectedIntelbrasPhysicalEnabled && selectedIntelbrasBenchEnabled && !selectedIntelbrasPasswordConfigured && <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-center text-xs text-amber-100">Cadastre a Senha Master da central AMT-8000.</div>}
                  {INTELBRAS_PHYSICAL_COMMAND_ENABLED && selectedIntelbrasPhysicalEnabled && selectedIntelbrasBenchEnabled && selectedIntelbrasPasswordConfigured && !selectedIntelbrasOnline && <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-center text-xs text-amber-100">A central está sem sessão ativa no receptor. O comando não será guardado para envio tardio.</div>}
                  {INTELBRAS_PHYSICAL_COMMAND_ENABLED && selectedIntelbrasAction === "arm" ? (
                    <Button className="w-full border border-emerald-400/60 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25" disabled={sendIntelbrasPhysicalMut.isPending || remoteCommandReason.trim().length < 5} onClick={() => submitIntelbrasPhysical("arm")}>
                      {sendIntelbrasPhysicalMut.isPending ? "Aguardando..." : "ARMAR central Intelbras"}
                    </Button>
                  ) : INTELBRAS_PHYSICAL_COMMAND_ENABLED && selectedIntelbrasAction === "disarm" ? (
                    <Button className="w-full border border-red-400/60 bg-red-500/15 text-red-50 hover:bg-red-500/25" disabled={sendIntelbrasPhysicalMut.isPending || remoteCommandReason.trim().length < 5} onClick={() => submitIntelbrasPhysical("disarm")}>
                      {sendIntelbrasPhysicalMut.isPending ? "Aguardando..." : "DESARMAR central Intelbras"}
                    </Button>
                  ) : (
                    INTELBRAS_PHYSICAL_COMMAND_ENABLED && selectedIntelbrasPhysicalEnabled && selectedIntelbrasBenchEnabled && selectedIntelbrasPasswordConfigured && selectedIntelbrasOnline && <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-center text-xs text-amber-100">O comando fica bloqueado até haver um estado Armado ou Desarmado confirmado para esta central.</div>
                  )}
                  <p className="text-center text-[11px] text-muted-foreground">Nenhum quadro físico será enviado nesta versão. O comando só será reabilitado após implementar e validar autenticação com senha de usuário/Master e o comando de Arme/Desarme documentado para AMT-8000.</p>
                </div>}
              </div>
              <div className="rounded-lg border border-border bg-black/15 p-4">
                <h4 className="font-bold text-foreground">Histórico desta central</h4>
                <p className="mt-1 text-xs text-muted-foreground">Cada item informa operador, motivo e resultado. {selectedRemoteBrand === "COMPATEC" ? "Arme/Desarme total usam AK4[4]/AK4[12]; Inibir/Restaurar Zona transmite AK2→AK1 pela conexão autenticada. A resposta KA1 informa recebimento, não confirma o estado final do bypass. Arme Stay/partição continua bloqueado até homologação Compatec; PGM não está habilitada nesta ação." : selectedRemoteBrand === "INTELBRAS" ? "A simulação não transmite. O fluxo físico apresentado em registros antigos está bloqueado até correção; a senha de configuração/acesso remoto não é a Senha Master usada para Arme/Desarme." : "A consulta VSec 0x14 e o Desarme 0x43 da central de testes podem ser físicos; Arme, Zona e PGM Vetti permanecem simulados."}</p>
                {selectedRemoteBrand === "COMPATEC" && selectedRemoteSystemId > 0 && <CompatecCommandReconciliationPanel alarmSystemId={selectedRemoteSystemId} />}
                <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1 sm:max-h-[390px]">
                  {remoteCommandHistory.map((command: any) => <div key={command.id} className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-cyan-200">{REMOTE_COMMAND_HISTORY_LABELS[command.commandType as RemoteCommandHistoryType] || command.commandType}</strong><Badge className="bg-slate-700 text-slate-100">{getRemoteCommandHistoryStatusLabel(command)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{command.operatorName || "Operador"} · {new Date(command.status === "reconciled" ? command.updatedAt : command.confirmedAt || command.executedAt || command.createdAt).toLocaleString("pt-BR")}</p>{command.zoneNumber && <p className="mt-1 text-xs text-cyan-100">Zona: {command.zoneNumber}</p>}{command.technicalUserCode && <p className="mt-1 text-xs text-cyan-100">Usuário técnico: <strong className="font-mono">{command.technicalUserCode}</strong>{command.remoteEventId ? ` · Evento vinculado #${command.remoteEventId}` : ""}</p>}<p className="mt-2 text-sm text-foreground">{command.reason}</p>{getRemoteCommandFrames(command.commandPayload).length > 0 && <div className="mt-2 rounded border border-cyan-400/15 bg-black/25 p-2"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-cyan-300">{getRemoteCommandFrameLabel(command)}</p>{getRemoteCommandFrames(command.commandPayload).map((frame: string, index: number) => <code key={`${command.id}-${index}`} className="block break-all font-mono text-[10px] text-cyan-100">{frame.replace(/\r/g, "\\r").replace(/\n/g, "\\n")}</code>)}</div>}{command.responsePayload && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{command.responsePayload}</p>}</div>)}
                  {remoteCommandHistory.length === 0 && <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum comando remoto registrado para esta central.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {treatmentPanel && selectedEvent && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-5" onClick={() => setTreatmentPanel(null)}>
          <div className="max-h-[82vh] w-[min(720px,94vw)] overflow-hidden rounded-xl border border-primary/35 bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className={`flex items-start justify-between border-b border-border px-5 py-4 ${treatmentPanel === "contacts" ? "bg-emerald-500/10" : treatmentPanel === "users" ? "bg-blue-500/10" : "bg-cyan-500/10"}`}>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Conta {selectedEvent.account} · {selectedEvent.systemModel}</p>
                <h3 className="mt-1 flex items-center gap-2 text-lg font-bold text-foreground">
                  {treatmentPanel === "contacts" ? <Phone className="h-5 w-5 text-emerald-400" /> : treatmentPanel === "users" ? <Users className="h-5 w-5 text-blue-400" /> : treatmentPanel === "cameras" ? <Camera className="h-5 w-5 text-cyan-300" /> : <History className="h-5 w-5 text-cyan-300" />}
                  {treatmentPanel === "contacts" ? "Contatos para atendimento" : treatmentPanel === "users" ? "Usuários programados no painel" : treatmentPanel === "cameras" ? "Câmeras do cliente" : "Últimos eventos do cliente"}
                </h3>
              </div>
              <button type="button" onClick={() => setTreatmentPanel(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar painel"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[68vh] overflow-y-auto p-5">
              {treatmentPanel === "cameras" ? <div className="grid gap-3 sm:grid-cols-2">{(clientCameras || []).filter((camera: any) => camera.isActive !== false).map((camera: any, index: number) => <Button key={camera.id} variant="outline" className="h-auto min-h-24 justify-start whitespace-normal text-left" disabled={recordAuditActionMut.isPending || !!failedAuditAction} onClick={() => { setExpandedCam((clientCameras || []).findIndex((item: any) => item.id === camera.id) + 1); void recordAuditAction({ action: "camera_viewed", targetId: camera.id }); }} aria-label={`Abrir Câmera ${index + 1} — ${camera.name}`}><Camera className="mr-3 h-6 w-6 shrink-0" /><span><strong className="block">Câmera {index + 1}</strong>{camera.name}</span></Button>)}{!clientCameras?.some((camera: any) => camera.isActive !== false) && <p className="text-sm text-foreground">Nenhuma câmera ativa cadastrada para este cliente.</p>}</div> : treatmentPanel === "contacts" ? (
                <div className="space-y-3">
                  {treatmentContacts.map((contact: any) => {
                    const phone = contact.phone || "";
                    const whatsapp = contact.whatsapp || phone;
                    const digits = String(phone).replace(/\D/g, "");
                    const whatsappDigits = String(whatsapp).replace(/\D/g, "");
                    const whatsappInternational = whatsappDigits.startsWith("55") ? whatsappDigits : `55${whatsappDigits}`;
                    return <div key={contact.id} className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-foreground">{contact.name}</p><p className="mt-0.5 text-sm text-muted-foreground">{contact.role || "Contato do sistema"}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={recordAuditActionMut.isPending || !!failedAuditAction} onClick={() => void recordAuditAction({ action: "contact_selected", targetId: contact.id })}>Selecionar contato</Button>{phone && <Button size="sm" variant="outline" disabled={recordAuditActionMut.isPending || !!failedAuditAction} onClick={() => void openAuditedContact("contact_call_clicked", contact.id, `tel:${digits}`)} className="border-emerald-500/45 text-emerald-300">Ligar</Button>}{whatsappDigits && <Button size="sm" disabled={recordAuditActionMut.isPending || !!failedAuditAction} onClick={() => void openAuditedContact("contact_whatsapp_clicked", contact.id, `https://wa.me/${whatsappInternational}`)} className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400">WhatsApp</Button>}</div></div>
                      <div className="mt-3 grid gap-1.5 text-sm"><p className="font-mono text-emerald-300">{phone || whatsapp || "Telefone não informado"}</p>{contact.email && <p className="text-muted-foreground">{contact.email}</p>}</div>
                      {(contact.password || contact.counterPassword || contact.coercionPassword) && <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-200"><Shield className="h-3.5 w-3.5" /> Credenciais de segurança</p><div className="grid gap-2 text-xs sm:grid-cols-3"><p>Senha: <strong className="font-mono text-amber-100">{contact.password || "—"}</strong></p><p>Contra senha: <strong className="font-mono text-amber-100">{contact.counterPassword || "—"}</strong></p><p>Coação: <strong className="font-mono text-amber-100">{contact.coercionPassword || "—"}</strong></p></div></div>}
                    </div>;
                  })}
                  {treatmentContacts.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum contato cadastrado para esta central.</p>}
                </div>
              ) : treatmentPanel === "users" ? (
                <div className="space-y-3">
                  {treatmentAlarmUsers.map((panelUser: any) => <div key={panelUser.id} className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-md bg-blue-500/15 px-2 py-1 font-mono font-bold tracking-[0.15em] text-blue-300">{String(panelUser.userNumber).padStart(2, "0")}</span><div><p className="font-bold text-foreground">{panelUser.name}</p><p className="mt-0.5 text-sm text-muted-foreground">{panelUser.phone || "Telefone não informado"}</p></div></div><span className={panelUser.isActive === false ? "text-sm text-red-300" : "text-sm text-emerald-300"}>{panelUser.isActive === false ? "Inativo" : "Ativo"}</span></div>{(panelUser.password || panelUser.counterPassword || panelUser.coercionPassword) && <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-200"><Shield className="h-3.5 w-3.5" /> Credenciais do usuário</p><div className="grid gap-2 text-xs sm:grid-cols-3"><p>Senha: <strong className="font-mono text-amber-100">{panelUser.password || "—"}</strong></p><p>Contra senha: <strong className="font-mono text-amber-100">{panelUser.counterPassword || "—"}</strong></p><p>Coação: <strong className="font-mono text-amber-100">{panelUser.coercionPassword || "—"}</strong></p></div></div>}</div>)}
                  {treatmentAlarmUsers.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum usuário programado para esta central.</p>}
                </div>
              ) : selectedEvent.incidentId ? (
                <RecentClientEventsPanel incidentId={selectedEvent.incidentId} currentEventId={selectedEvent.id} />
              ) : (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Esta ocorrência não tem um identificador ativo para consultar os eventos do cliente.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showProceduresModal && selectedEvent && (
        <div className="fixed inset-0 z-[98] flex items-end justify-center bg-black/75 p-2 sm:items-center sm:p-5" onClick={() => setShowProceduresModal(false)}>
          <div className="max-h-[calc(100dvh-1rem)] w-full overflow-hidden rounded-t-xl border border-border bg-card shadow-2xl sm:max-h-[78dvh] sm:w-[min(760px,94vw)] sm:rounded-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Conta {selectedEvent.account}</p><h3 className="mt-1 text-lg font-bold text-foreground">Providências e histórico do atendimento</h3></div><button type="button" onClick={() => setShowProceduresModal(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar providências"><X className="h-5 w-5" /></button></div>
            <div className="max-h-[calc(100dvh-8rem)] space-y-3 overflow-y-auto p-4 sm:max-h-[62dvh] sm:p-5"><OperationalProcedurePanel clientIdentified={!!selectedClient?.id} eventType={treatmentProcedureData?.eventType} procedures={treatmentProcedures} hasSpecificProcedure={treatmentProcedureData?.hasSpecificProcedure} isLoading={treatmentProcedureQuery.isLoading} error={treatmentProcedureQuery.error} onRetry={() => void treatmentProcedureQuery.refetch()} /><h4 className="pt-3 font-semibold">Registros deste atendimento</h4>{attendingNotes.trim() && <div className="rounded-lg border border-primary/30 bg-primary/5 p-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">Registro em andamento</p><p className="whitespace-pre-wrap text-sm text-foreground">{attendingNotes}</p></div>}{logs.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma anotação registrada ainda.</p> : logs.map((log, index) => <div key={index} className="rounded-lg border border-border bg-black/15 p-3 font-mono text-xs text-muted-foreground">{log}</div>)}</div>
          </div>
        </div>
      )}

      {standaloneRemoteRequest && (
        <div className="fixed inset-0 z-[94] flex items-center justify-center bg-black/75 p-4" onClick={() => setStandaloneRemoteRequest(null)}>
          <div className={`max-h-[92dvh] w-full overflow-y-auto rounded-xl border border-emerald-400/35 bg-card p-5 shadow-2xl ${standaloneRemoteMode === "zones" ? "max-w-3xl" : "max-w-lg"}`} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">Solicitação operacional</p>
                <h3 className="mt-1 text-lg font-bold text-foreground">Comando sem ocorrência</h3>
                <p className="mt-1 text-sm text-muted-foreground">Use quando não existir alarme aberto. Arme exige uma das três bases autorizadas. A solicitação não cria evento Contact ID nem cartão na fila.</p>
              </div>
              <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => { setStandaloneRemoteRequest(null); setStandaloneRemoteMode("total"); }} aria-label="Fechar solicitação de comando"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm">
              <p className="font-bold text-foreground">{standaloneRemoteRequest.clientName || "Cliente não identificado"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Conta {standaloneRemoteRequest.account} · {standaloneRemoteRequest.brand} {standaloneRemoteRequest.model || ""}</p>
            </div>
            {standaloneRemoteRequest.brand?.toUpperCase() === "COMPATEC" && standaloneRemoteSystemId > 0 && <CompatecCommandReconciliationPanel alarmSystemId={standaloneRemoteSystemId} />}
            {isStandalonePhysicalCommandSupported(standaloneRemoteRequest.brand) && <div role="tablist" aria-label="Tipo de comando Compatec" className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" role="tab" aria-selected={standaloneRemoteMode === "total"} variant={standaloneRemoteMode === "total" ? "default" : "outline"} onClick={() => setStandaloneRemoteMode("total")}>Arme/Desarme total</Button>
              <Button type="button" role="tab" aria-selected={standaloneRemoteMode === "zones"} variant={standaloneRemoteMode === "zones" ? "default" : "outline"} onClick={() => setStandaloneRemoteMode("zones")}>Setores</Button>
            </div>}
            {standaloneRemoteMode === "zones" && isStandalonePhysicalCommandSupported(standaloneRemoteRequest.brand) ? (
              standaloneRemoteSystem ? <div className="mt-4 space-y-3">
                <CompatecZoneConfigurationPanel
                  standalone
                  isVisible={standaloneRemoteMode === "zones"}
                  reasonValue={standaloneRemoteReason}
                  onReasonValueChange={setStandaloneRemoteReason}
                  alarmSystemId={standaloneRemoteSystemId}
                  account={String(standaloneRemoteRequest.account || "")}
                  model={standaloneRemoteSystem.model}
                  macAddress={standaloneRemoteSystem.macAddress}
                  imeiGprs={standaloneRemoteSystem.imeiGprs}
                  receiverPort={standaloneRemoteSystem.receiverPort}
                  canOperate={Boolean(user && ["admin", "supervisor", "operator"].includes(user.role))}
                  onSubmitted={() => { setStandaloneRemoteRequest(null); setStandaloneRemoteMode("total"); }}
                />
                <div className="flex justify-end"><Button variant="outline" onClick={() => setStandaloneRemoteRequest(null)}>Cancelar</Button></div>
              </div> : <p role="alert" className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">Não foi possível carregar a central cadastrada. Nenhum comando está habilitado.</p>
            ) : <>
              {standaloneRemoteMode === "total" && <p role="status" className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                Estado na lista: <strong>{standaloneRemoteRequest.commandType === "arm" ? "DESARMADO" : "ARMADO"}</strong>. Esta opção permite somente <strong>{standaloneRemoteRequest.commandType === "arm" ? "ARMAR" : "DESARMAR"} total</strong>.
              </p>}
              <div className="mt-4 space-y-3">
                {standaloneRemoteRequest.commandType === "arm" ? <label className="block text-sm font-medium text-foreground">Base autorizadora do Arme
                  <select aria-label="Base autorizadora do Arme" value={standaloneArmAuthorizationBasis} onChange={(event) => setStandaloneArmAuthorizationBasis(event.target.value as CompatecArmAuthorizationBasis | "")} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Selecione…</option>
                    {getCompatecArmAuthorizationOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label> : <label className="block text-sm font-medium text-foreground">Descrição / motivo (mínimo 5 caracteres)
                  <Textarea className="mt-1 min-h-24" value={standaloneRemoteReason} onChange={(event) => setStandaloneRemoteReason(event.target.value)} placeholder="Ex.: Desarmado para entrada de funcionários." />
                </label>}
                {standaloneRemoteRequest.commandType === "disarm" && standaloneRemoteReason.trim().length < 5 && <p className="text-xs text-amber-200">Digite um motivo com pelo menos 5 caracteres para liberar a confirmação.</p>}
                <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs leading-relaxed text-cyan-50"><strong>Auditoria automática:</strong> o operador e a base autorizadora do Arme (ou descrição do Desarme) ficarão no histórico. A confirmação da central será registrada separadamente.</div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStandaloneRemoteRequest(null)}>Cancelar</Button>
                <Button className={standaloneRemoteRequest.commandType === "arm" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-red-600 text-white hover:bg-red-700"} disabled={armCompatecAllMut.isPending || disarmBenchAllMut.isPending || (standaloneRemoteRequest.commandType === "arm" ? !standaloneArmAuthorizationBasis : standaloneRemoteReason.trim().length < 5)} onClick={submitStandaloneCommandRequest}>
                  {armCompatecAllMut.isPending || disarmBenchAllMut.isPending ? "Enviando..." : `Confirmar ${standaloneRemoteRequest.commandType === "arm" ? "ARMAR" : "DESARMAR"} total`}
                </Button>
              </div>
            </>}
          </div>
        </div>
      )}

      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* TOP BAR - Botões de Status */}
        <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-2 sm:px-4 md:flex-nowrap md:justify-between">
          <Button type="button" variant="outline" size="sm" className="shrink-0 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10" onClick={openManualOccurrence}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Ocorrência Manual
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 md:flex-none md:overflow-visible">
            <Button
              size="sm"
              variant="outline"
              onClick={() => audioEnabled ? requestAudioDeactivation() : enableAlertAudio()}
              className={`shrink-0 ${audioEnabled
                ? "border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
                : audioActivationNeeded
                  ? "border-amber-400 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 animate-pulse"
                  : "border-amber-400 text-amber-200 hover:bg-amber-500/15"}`}
              title={audioEnabled ? "Para desativar, informe a senha do usuário logado" : "Ative uma vez após entrar no sistema para permitir alertas sonoros"}
            >
              {audioEnabled ? <Volume2 className="h-3.5 w-3.5 mr-1" /> : <VolumeX className="h-3.5 w-3.5 mr-1" />}
              {audioEnabled ? "Áudio ativo" : "Ativar áudio"}
            </Button>
            <Button variant="outline" size="sm" className="shrink-0 border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold" onClick={() => { setOperationalStatusSearch(""); setArmDisarmModal('disarmed'); }}>
              <WifiOff className="h-3.5 w-3.5 mr-1" /> Desarmados ({armDisarmData?.disarmed?.length || 0})
            </Button>
            <Button variant="outline" size="sm" className="shrink-0 border-green-500/50 text-green-400 hover:bg-green-500/10 font-bold" onClick={() => { setOperationalStatusSearch(""); setArmDisarmModal('armed'); }}>
              <Shield className="h-3.5 w-3.5 mr-1" /> Armados ({armDisarmData?.armed?.length || 0})
            </Button>
            <Button variant="outline" size="sm" className={`shrink-0 font-bold ${scheduleAlerts.length ? "border-amber-500/70 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" : "border-border text-muted-foreground"}`} onClick={() => setScheduleAlertsModal(true)}>
              <CalendarClock className="mr-1 h-3.5 w-3.5" /> Agenda ({scheduleAlerts.length})
            </Button>
            <Button size="sm" className="shrink-0 bg-green-600 text-white font-bold hover:bg-green-700" onClick={() => { setOperationalStatusSearch(""); setConnectionStatusModal("online"); }}>
              <Wifi className="h-3.5 w-3.5 mr-1" /> Online ({onlineSystems.length})
            </Button>
            <Button size="sm" className="shrink-0 bg-red-600 text-white font-bold hover:bg-red-700" onClick={() => { setOperationalStatusSearch(""); setConnectionStatusModal("offline"); }}>
              <WifiOff className="h-3.5 w-3.5 mr-1" /> Offline ({offlineSystems.length})
            </Button>
            <Button size="sm" variant="outline" className="shrink-0 border-amber-500/60 text-amber-300 hover:bg-amber-500/10 font-bold" onClick={() => { setOperationalStatusSearch(""); setBlockedClientsModal(true); }}>
              <Ban className="h-3.5 w-3.5 mr-1" /> Bloqueados ({blockedClients.length})
            </Button>
          </div>
        </div>

        <div className="min-h-7 border-b border-emerald-500/20 bg-emerald-500/5 px-4 flex items-center overflow-hidden" aria-live="polite">
          {recentAutoFinalizedArmDisarm?.[0] ? (
            <div className="flex min-w-0 items-center gap-2 text-xs text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="shrink-0 font-bold">Última confirmação automática</span>
              <span className="truncate">
                {recentAutoFinalizedArmDisarm[0].stateLabel} · Conta {recentAutoFinalizedArmDisarm[0].account} · {recentAutoFinalizedArmDisarm[0].brand} · {recentAutoFinalizedArmDisarm[0].description || `Evento ${recentAutoFinalizedArmDisarm[0].eventCode}`}
              </span>
              <span className="shrink-0 text-emerald-300/80">
                {recentAutoFinalizedArmDisarm[0].receivedAt ? new Date(recentAutoFinalizedArmDisarm[0].receivedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
              Nenhuma confirmação automática recente de Arme ou Desarme
            </div>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div className="flex min-h-0 flex-1 overflow-hidden max-lg:flex-col">
          {/* SELETOR COMPACTO DAS FILAS RECOLHIDAS */}
          <div className={`flex h-full w-[60px] min-w-[60px] flex-col items-center gap-2 border-r border-border bg-card px-1 py-3 sm:w-[76px] sm:min-w-[76px] sm:px-2 ${selectedEvent ? "max-lg:hidden" : "max-lg:h-12 max-lg:min-h-12 max-lg:w-full max-lg:min-w-0 max-lg:flex-row max-lg:border-b max-lg:border-r-0 max-lg:py-1"}`}>
            <span className="text-[9px] font-bold tracking-[0.15em] text-muted-foreground">FILAS</span>
            {([
              { key: "attending" as const, label: "Atendimento", color: "text-blue-400 border-blue-500/40 bg-blue-500/10", icon: Headphones },
              { key: "observing" as const, label: "Observação", color: "text-purple-400 border-purple-500/40 bg-purple-500/10", icon: Eye },
              { key: "tactical" as const, label: "Tático", color: "text-orange-400 border-orange-500/40 bg-orange-500/10", icon: CarFront },
              { key: "maintenance" as const, label: "Manutenção", color: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10", icon: Wrench },
            ]).map((queue) => {
              const Icon = queue.icon;
              const isExpanded = expandedQueue === queue.key;
              return <button key={queue.key} type="button" title={`${queue.label} (${grouped[queue.key].length})`} onClick={() => setExpandedQueue(isExpanded ? null : queue.key)} className={`relative flex h-12 w-12 items-center justify-center rounded-lg border transition-colors ${queue.color} ${isExpanded ? "ring-1 ring-current" : "hover:bg-muted/30"}`}><Icon className="h-5 w-5" />{grouped[queue.key].length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background">{grouped[queue.key].length}</span>}</button>;
            })}
          </div>

          {/* ÁREA CENTRAL: filas ou atendimento, sem sobrepor os logs */}
          <main aria-label="Área central de atendimento" className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden max-lg:h-auto">
          {selectedEvent ? occurrenceTreatmentPanel : <div className="flex h-full min-w-0 flex-1 flex-col border-r border-border bg-card">
            <div className="px-3 py-2 border-b border-border flex items-center">
              <div className="flex items-center gap-2">
                {connected ? (
                  <><div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /><span className="text-xs text-green-400 font-bold">ONLINE</span></>
                ) : (
                  <><div className="h-2 w-2 rounded-full bg-red-500" /><span className="text-xs text-red-400 font-bold">OFFLINE</span></>
                )}
              </div>
            </div>
            {expandedQueue && <div className="max-h-[32%] overflow-y-auto border-b border-border bg-muted/10"><QueueSection title={expandedQueue === "attending" ? "EM ATENDIMENTO" : expandedQueue === "observing" ? "EM OBSERVAÇÃO" : expandedQueue === "tactical" ? "ATENDIMENTO TÁTICO" : "EM MANUTENÇÃO"} color={expandedQueue === "attending" ? "text-blue-400" : expandedQueue === "observing" ? "text-purple-400" : expandedQueue === "tactical" ? "text-orange-400" : "text-yellow-400"} events={grouped[expandedQueue]} /></div>}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-red-500/30 bg-red-500/5 px-3 py-2"><span className="text-sm font-bold text-red-400">AGUARDANDO ({visibleWaitingEvents.length})</span><span className="text-[10px] font-medium text-red-200/70">Mais recentes no topo</span></div>
              <div className="flex-1 overflow-y-auto p-3">
                {waitingGroups.map(({ key, events }) => {
                  const [mostRecent, ...otherEvents] = events;
                  const isCollapsed = collapsedWaitingAccounts.has(key);
                  const visibleGroupEvents = isCollapsed ? [mostRecent] : events;
                  return (
                    <div key={key} className="mb-3 w-full min-w-0 rounded-lg border border-border/60 bg-black/10 p-2">
                      <button type="button" onClick={() => toggleWaitingAccount(key)} className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/40">
                        <span className="min-w-0 truncate text-[11px] font-bold text-muted-foreground"><span className="font-mono tracking-[0.1em] text-primary">{mostRecent.account}</span> <span className="mx-1">·</span>{mostRecent.clientName || `Conta ${mostRecent.account}`}</span>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground">{events.length} {events.length === 1 ? "evento" : "eventos"}{events.length > 1 ? isCollapsed ? " · Expandir" : " · Recolher" : ""}</span>
                      </button>
                      <div className="mt-2 grid w-full grid-cols-1 gap-2 xl:grid-cols-2">
                        {visibleGroupEvents.map((event, index) => (
                          <div key={`${event.account}-${event.queuedAt}-${event.eventCode}-${index}`} className={visibleGroupEvents.length === 1 ? "xl:col-span-2" : ""}>
                            <EventCard ev={event} groupedCard />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {grouped.waiting.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma ocorrência</p>}
              </div>
            </div>
          </div>}
          </main>

          {/* COLUNA 3: Logs da Ocorrência */}
          <aside aria-label="Logs da Ocorrência" className="w-[300px] min-w-[300px] h-full border-l border-cyan-500/30 bg-card text-foreground flex flex-col max-lg:h-[min(34dvh,280px)] max-lg:min-h-[160px] max-lg:w-full max-lg:min-w-0 max-lg:border-l-0 max-lg:border-t">
            <ScrollArea className="flex-1 px-4 py-3">
              <IncidentAuditTimeline incidentId={selectedEvent?.incidentId || auditIncidentId} active />
              {failedAuditAction && <div role="alert" className="mt-3 rounded border border-red-400 bg-red-500/10 p-3 text-sm text-red-100">Registro de auditoria pendente para ocorrência #{failedAuditAction.incidentId}.<Button className="mt-2" variant="outline" size="sm" onClick={() => void retryFailedAuditAction()} disabled={recordAuditActionMut.isPending}>Tentar gravar novamente</Button></div>}
            </ScrollArea>
          </aside>
        </div>
      </div>

      {/* Observação temporizada: a ocorrência volta ao atendimento ao chegar no prazo. */}
      {observationOpen && selectedEvent && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center" onClick={() => setObservationOpen(false)}>
          <div className="bg-card border border-purple-500/40 rounded-lg w-[470px] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg text-purple-200">Colocar em Observação</h3>
                <p className="text-xs text-muted-foreground">Apenas esta ocorrência ficará em observação; os demais eventos do sistema continuam chegando normalmente.</p>
              </div>
              <button onClick={() => setObservationOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Data e hora para retornar ao atendimento
              <input type="datetime-local" value={observationUntil} onChange={(event) => setObservationUntil(event.target.value)} className="mt-1 w-full h-9 rounded border border-border bg-background px-2 text-sm text-foreground" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground mt-3">
              Observação para o operador
              <textarea value={observationNotes} onChange={(event) => setObservationNotes(event.target.value)} placeholder="Ex.: Falta de energia; acompanhar por 30 minutos." className="mt-1 min-h-[88px] w-full rounded border border-border bg-background px-2 py-2 text-sm text-foreground" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setObservationOpen(false)}>Cancelar</Button>
              <Button className="bg-purple-600 hover:bg-purple-700" disabled={!canOperateSelected || observeIncidentMut.isPending} onClick={() => void confirmObservation()}>{observeIncidentMut.isPending ? "Salvando..." : "Confirmar observação"}</Button>
            </div>
          </div>
        </div>
      )}

      {tacticalReasonOpen && selectedEvent && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4" onClick={() => setTacticalReasonOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="tactical-reason-title" className="w-full max-w-lg rounded-lg border border-orange-500/40 bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 id="tactical-reason-title" className="text-lg font-bold text-orange-200">Encaminhar ao Tático</h3>
            <p className="mt-1 text-sm text-muted-foreground">Informe o motivo. O envio libera o painel após a confirmação do servidor.</p>
            <Textarea className="mt-3 min-h-24" value={tacticalReason} onChange={(event) => setTacticalReason(event.target.value)} placeholder="Motivo do acionamento tático (mínimo de 5 caracteres)" />
            <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setTacticalReasonOpen(false)}>Cancelar</Button><Button className="bg-orange-600 hover:bg-orange-700" disabled={!canOperateSelected || tacticalReason.trim().length < 5 || updateIncidentMut.isPending} onClick={async () => { const result = await moveEvent(selectedEvent, tacticalReason); if (result) setTacticalReasonOpen(false); }}>Confirmar Tático</Button></div>
          </div>
        </div>
      )}

      {pausePanelOpen && selectedEvent && (
        <div className="fixed inset-0 z-[86] flex items-center justify-center bg-black/70 p-4" onClick={() => setPausePanelOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="pause-panel-title" className="w-full max-w-md rounded-lg border border-amber-500/40 bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 id="pause-panel-title" className="text-lg font-bold text-amber-200">Pausar atendimento</h3>
            <p className="mt-1 text-sm text-muted-foreground">O painel só será fechado após o servidor confirmar a pausa. O motivo ficará registrado e a ocorrência seguirá na mesma fila.</p>
            <Textarea className="mt-3 min-h-24" autoFocus value={pausePanelReason} onChange={(event) => setPausePanelReason(event.target.value)} placeholder="Motivo da pausa (obrigatório, mínimo de 5 caracteres)" />
            <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setPausePanelOpen(false)}>Continuar no painel</Button><Button className="bg-amber-600 text-black hover:bg-amber-500" disabled={pausePanelMut.isPending || pausePanelReason.trim().length < 5} onClick={() => void confirmPausePanel()}>{pausePanelMut.isPending ? "Pausando..." : "Confirmar pausa"}</Button></div>
          </div>
        </div>
      )}

      {/* Manutenção é aplicada ao sistema inteiro e não somente ao evento selecionado. */}
      {maintenanceOpen && selectedEvent && selectedSystem && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center" onClick={() => setMaintenanceOpen(false)}>
          <div className="bg-card border border-yellow-500/40 rounded-lg w-[500px] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg text-yellow-200">Programar Manutenção do Sistema</h3>
                <p className="text-xs text-muted-foreground">Conta {selectedSystem.account}. No período informado, todos os eventos deste sistema serão finalizados automaticamente como “Sistema em manutenção”.</p>
              </div>
              <button onClick={() => setMaintenanceOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-muted-foreground">
                Início
                <input type="datetime-local" value={maintenanceStartAt} onChange={(event) => setMaintenanceStartAt(event.target.value)} className="mt-1 w-full h-9 rounded border border-border bg-background px-2 text-sm text-foreground" />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Fim
                <input type="datetime-local" value={maintenanceEndAt} onChange={(event) => setMaintenanceEndAt(event.target.value)} className="mt-1 w-full h-9 rounded border border-border bg-background px-2 text-sm text-foreground" />
              </label>
            </div>
            <label className="block text-xs font-medium text-muted-foreground mt-3">
              Motivo ou referência técnica
              <textarea value={maintenanceNotes} onChange={(event) => setMaintenanceNotes(event.target.value)} placeholder="Ex.: Técnico João em campo revisando a central." className="mt-1 min-h-[76px] w-full rounded border border-border bg-background px-2 py-2 text-sm text-foreground" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMaintenanceOpen(false)}>Cancelar</Button>
              <Button className="bg-yellow-600 hover:bg-yellow-700 text-black" disabled={!canOperateSelected || startMaintenanceMut.isPending} onClick={() => void confirmMaintenance()}>{startMaintenanceMut.isPending ? "Salvando..." : "Iniciar manutenção"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Ocorrência Manual */}
      {manualOccurrenceOpen && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center" onClick={() => setManualOccurrenceOpen(false)}>
          <div className="bg-card border border-border rounded-lg w-[480px] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg text-foreground">Nova Ocorrência Manual</h3>
                <p className="text-xs text-muted-foreground">Cria uma ocorrência diretamente na fila Aguardando.</p>
              </div>
              <button onClick={() => setManualOccurrenceOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-medium text-muted-foreground">
                Conta Contact ID
                <input
                  type="text"
                  value={manualAccount}
                  onChange={(event) => setManualAccount(event.target.value.toUpperCase())}
                  className="mt-1 w-full h-9 rounded border border-border bg-background px-2 text-sm text-foreground"
                  placeholder="Deixe em branco para a Conta do Sistema (0000)"
                  maxLength={10}
                />
                <span className="mt-1 block text-[11px] font-normal text-muted-foreground">Informe a conta do cliente; em branco, a ocorrência será registrada na Conta do Sistema 0000.</span>
              </label>
              {manualAccount.trim() && (
                manualAccountMatch.system ? (
                  <div className="rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2">
                    <p className="text-sm font-semibold text-green-300">{manualAccountMatch.client?.fantasyName || manualAccountMatch.client?.name || "Cliente identificado"}</p>
                    <p className="mt-0.5 text-xs text-green-100/80">Conta {manualAccountMatch.system.account} · {manualAccountMatch.system.brand} {manualAccountMatch.system.model || ""}</p>
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Conta não cadastrada: a ocorrência será vinculada à Conta do Sistema 0000.
                  </div>
                )
              )}
              <label className="block text-xs font-medium text-muted-foreground">
                Prioridade
                <select value={manualPriority} onChange={(event) => setManualPriority(event.target.value as typeof manualPriority)} className="mt-1 w-full h-9 rounded border border-border bg-background px-2 text-sm text-foreground">
                  <option value="critical">Crítica</option>
                  <option value="high">Alta</option>
                  <option value="medium">Média</option>
                  <option value="low">Baixa</option>
                </select>
              </label>
              <textarea
                value={manualDescription}
                onChange={(event) => setManualDescription(event.target.value)}
                placeholder="Descreva a ocorrência manual..."
                className="min-h-[100px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-yellow-400"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="h-9 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted" onClick={() => setManualOccurrenceOpen(false)}>Cancelar</button>
                <button type="button" className="h-9 rounded-md bg-yellow-600 px-3 text-sm font-medium text-white hover:bg-yellow-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={createManualEventMut.isPending} onClick={createManualOccurrence}>
                  <Plus className="h-4 w-4 mr-1" /> {createManualEventMut.isPending ? "Criando..." : "Criar ocorrência"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Finalização em massa */}
      {bulkFinalizeOpen && selectedEvent && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center" onClick={() => setBulkFinalizeOpen(false)}>
          <div className="bg-card border border-orange-500/40 rounded-lg w-[440px] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg text-orange-300">Finalizar eventos em massa</h3>
              <button onClick={() => setBulkFinalizeOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            {isBulkPreviewFetching ? <p className="text-sm text-muted-foreground" role="status">Conferindo no banco os atendimentos desta central...</p>
              : bulkPreviewError ? <p className="text-sm text-red-300" role="alert">Não foi possível conferir o lote. Nenhum atendimento será finalizado sem essa consulta.</p>
              : bulkPreview && <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">Conta <strong className="text-foreground">{selectedEvent.account}</strong>: <strong className="text-foreground">{bulkPreview.totalCount} atendimentos</strong> persistidos nesta central.</p>
                {bulkPreview.eventCount !== bulkPreview.totalCount && <p className="text-amber-300">São {bulkPreview.eventCount} eventos recebidos e {bulkPreview.totalCount} atendimentos, pois existem registros legados vinculados ao mesmo evento.</p>}
                <p className="text-muted-foreground">Serão finalizados exatamente <strong className="text-foreground">{bulkPreview.eligibleCount} {bulkPreview.eligibleCount === 1 ? "atendimento" : "atendimentos"}</strong> elegíveis, incluindo observações automáticas sem operador. Cada registro terá seu relatório preservado, sem enviar notificações individuais.</p>
                {bulkPreview.protectedCount > 0 && <p className="text-amber-300">{bulkPreview.protectedCount} registro(s) de outro operador ou em manutenção permanecerão na fila.</p>}
                {bulkPreview.protectedRows.length > 0 && <details><summary className="cursor-pointer text-xs text-amber-200">Ver registros protegidos</summary><div className="mt-2 max-h-32 overflow-y-auto space-y-1 text-xs text-muted-foreground">{bulkPreview.protectedRows.map((row) => <p key={row.incidentId}>#{row.incidentId} — {row.reason}</p>)}</div></details>}
                <p className="text-xs text-muted-foreground">Se algum dos IDs confirmados ficar indisponível ou passar a ser protegido, o lote não será fechado parcialmente: será necessário conferir novamente.</p>
              </div>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkFinalizeOpen(false)}>Cancelar</Button>
              <Button variant="outline" disabled={bulkFinalizeMut.isPending || isBulkPreviewFetching} onClick={() => void refreshBulkPreview()}>Atualizar lote</Button>
              <Button className="bg-orange-600 hover:bg-orange-700" disabled={bulkFinalizeMut.isPending || isBulkPreviewFetching || Boolean(bulkPreviewError) || !bulkPreview?.eligibleCount} onClick={() => void finalizeSameClientEvents(selectedEvent)}>{bulkFinalizeMut.isPending ? "Finalizando..." : "Confirmar finalização"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de centrais por status */}
      {connectionStatusModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center" onClick={() => setConnectionStatusModal(null)}>
          <div className="bg-card border border-border rounded-lg w-[560px] max-h-[70vh] overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className={`px-4 py-3 border-b border-border flex items-center justify-between ${connectionStatusModal === "online" ? "bg-green-500/10" : "bg-red-500/10"}`}>
              <h3 className={`font-bold ${connectionStatusModal === "online" ? "text-green-400" : "text-red-400"}`}>
                {connectionStatusModal === "online" ? `Centrais Online (${onlineSystems.length})` : `Centrais Offline (${offlineSystems.length})`}
              </h3>
              <button onClick={() => setConnectionStatusModal(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-3 border-b border-border bg-muted/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={operationalStatusSearch} onChange={(event) => setOperationalStatusSearch(event.target.value)} placeholder="Buscar por conta, cliente, fantasia ou parceira..." className="pl-9" />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[58vh] p-2">
              {connectionStatusSystems.map((system: any) => {
                const client = (clientData || []).find((item: any) => item.id === system.clientId);
                return (
                  <div key={system.id} className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 hover:bg-muted/30">
                    <div>
                      <p className="text-sm font-bold text-foreground">{client?.fantasyName || client?.name || "Cliente não identificado"}</p>
                      <p className="text-xs text-muted-foreground">Conta {system.account} · {system.brand} {system.model || ""} · Porta {system.receiverPort || "não definida"}</p>
                      <p className="text-[11px] text-cyan-300/80">Parceira: {system.partnerName || partnersById.get(client?.partnerCompanyId)?.name || "Sem parceira vinculada"}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={connectionStatusModal === "online" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>{connectionStatusModal === "online" ? "ONLINE" : "OFFLINE"}</Badge>
                      <p className="text-[11px] text-muted-foreground mt-1">{system.lastCommunication ? `Última comunicação: ${new Date(system.lastCommunication).toLocaleString("pt-BR")}` : "Sem comunicação registrada"}</p>
                    </div>
                  </div>
                );
              })}
              {connectionStatusSystems.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma central encontrada para esta busca.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Clientes bloqueados ou suspensos */}
      {blockedClientsModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center" onClick={() => setBlockedClientsModal(false)}>
          <div className="bg-card border border-amber-500/40 rounded-lg w-[600px] max-h-[70vh] overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="px-4 py-3 border-b border-amber-500/30 flex items-center justify-between bg-amber-500/10">
              <h3 className="font-bold text-amber-300">Clientes Bloqueados / Suspensos ({blockedClients.length})</h3>
              <button onClick={() => setBlockedClientsModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-3 border-b border-border bg-muted/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={operationalStatusSearch} onChange={(event) => setOperationalStatusSearch(event.target.value)} placeholder="Buscar por conta, cliente, fantasia ou parceira..." className="pl-9" />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[54vh] p-2">
              {filteredBlockedClients.map((client: any) => {
                const status = getEffectiveClientMonitoringStatus(client);
                return (
                  <div key={client.id} className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-border/50 hover:bg-muted/30">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{client.fantasyName || client.name}</p>
                      {client.fantasyName && <p className="text-xs text-muted-foreground truncate">{client.name}</p>}
                      <p className="text-xs text-muted-foreground">Conta {client.accounts?.length ? client.accounts.join(" · ") : "não cadastrada"}{client.monitoringStatusReason ? ` · ${client.monitoringStatusReason}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className="bg-amber-500/20 text-amber-300">{status === "blocked" ? "BLOQUEADO" : "SUSPENSO"}</Badge>
                      {status === "suspended" && client.monitoringStatusUntil && <p className="text-[11px] text-muted-foreground mt-1">Até {new Date(client.monitoringStatusUntil).toLocaleString("pt-BR")}</p>}
                    </div>
                  </div>
                );
              })}
              {filteredBlockedClients.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum cliente bloqueado ou suspenso para esta busca.</p>}
            </div>
          </div>
        </div>
      )}

      {scheduleAlertsModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-3" onClick={() => setScheduleAlertsModal(false)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-amber-500/30 bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border bg-amber-500/10 px-4 py-3">
              <div><h3 className="flex items-center gap-2 font-bold text-amber-200"><CalendarClock className="h-4 w-4" />Alertas da agenda ({scheduleAlerts.length})</h3><p className="mt-1 text-xs text-muted-foreground">Centrais que não seguiram os horários cadastrados. Prazo para atraso de Arme: 10 minutos.</p></div>
              <Button variant="ghost" size="icon" aria-label="Fechar alertas de agenda" onClick={() => setScheduleAlertsModal(false)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="overflow-y-auto p-3">
              {scheduleAlerts.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum alerta ativo de agenda.</p> : <div className="space-y-2">
                {scheduleAlerts.map((alert: any) => <div key={alert.id} className="flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{alert.alertType === "unexpected_disarm" ? "DESARME fora do horário" : "ARME não realizado no horário"} · Conta {alert.account} · {alert.brand} {alert.model || ""}</p>
                    <p className="text-sm text-muted-foreground">{alert.fantasyName || alert.clientName || "Cliente não informado"}{alert.partnerName ? ` · Parceira: ${alert.partnerName}` : ""}</p>
                    <p className="mt-1 text-xs text-amber-200">{alert.alertType === "unexpected_disarm" ? "O painel foi desarmado fora do horário esperado; a agenda previa que permanecesse armado." : "O painel continuava desarmado 10 minutos após o Arme programado."} {alert.expectedAt ? `Horário previsto: ${new Date(alert.expectedAt).toLocaleString("pt-BR")} · ` : ""}Detectado: {alert.detectedAt ? new Date(alert.detectedAt).toLocaleString("pt-BR") : "—"}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={acknowledgeScheduleAlert.isPending} onClick={() => acknowledgeScheduleAlert.mutate({ id: alert.id })}>Ciente</Button>
                </div>)}
              </div>}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Armados/Desarmados */}
      {armDisarmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={() => setArmDisarmModal(null)}>
          <div className="bg-card border border-border rounded-lg w-[500px] max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className={`px-4 py-3 border-b border-border flex items-center justify-between ${armDisarmModal === 'armed' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <h3 className={`font-bold ${armDisarmModal === 'armed' ? 'text-green-400' : 'text-red-400'}`}>
                {armDisarmModal === 'armed' ? `Clientes Armados (${armDisarmData?.armed?.length || 0})` : `Clientes Desarmados (${armDisarmData?.disarmed?.length || 0})`}
              </h3>
              <button onClick={() => setArmDisarmModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-3 border-b border-border bg-muted/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={operationalStatusSearch} onChange={(event) => setOperationalStatusSearch(event.target.value)} placeholder="Buscar por conta, cliente, fantasia ou parceira..." className="pl-9" />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-2">
               {armDisarmSystems.map((item: any, idx: number) => (
                 <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/50 hover:bg-muted/30">
                   <div>
                     <p className="text-sm font-bold text-foreground">{item.clientName}</p>
                     <p className="text-xs text-muted-foreground">Conta: {item.account} · {item.brand || "Marca não informada"} {item.model || ""}</p>
                     <p className="text-[11px] text-cyan-300/80">Parceira: {item.partnerName || partnersById.get(clientsById.get(item.clientId)?.partnerCompanyId)?.name || "Sem parceira vinculada"}</p>
                   </div>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <Button size="sm" variant="outline" className="h-8 px-2 text-[11px] text-amber-200" disabled={!Number(item.alarmSystemId || item.systemId)} onClick={() => setQuickScheduleSystem({ id: Number(item.alarmSystemId || item.systemId), account: item.account, clientName: item.clientName, brand: item.brand, model: item.model })}>Alterar agenda</Button>
                    {isStandalonePhysicalCommandSupported(item.brand) ? <Button size="sm" className={armDisarmModal === "disarmed" ? "h-8 bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700" : "h-8 bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700"} onClick={() => openStandaloneCommandRequest(item, armDisarmModal === "disarmed" ? "arm" : "disarm")}>{armDisarmModal === "disarmed" ? "ARMAR" : "DESARMAR"}</Button> : <span className="text-[10px] text-muted-foreground">Comando não homologado</span>}
                     <div>
                     <p className="text-xs text-muted-foreground">
                       {item.lastEvent ? new Date(item.lastEvent).toLocaleString('pt-BR') : '-'}
                     </p>
                     <Badge className={armDisarmModal === 'armed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                       {armDisarmModal === 'armed' ? 'ARMADO' : 'DESARMADO'}
                     </Badge>
                     </div>
                   </div>
                 </div>
              ))}
              {armDisarmSystems.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum cliente encontrado para esta busca</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Popup de Finalizações Rápidas */}
      {selectedFinalization === "open" && (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center" onClick={() => setSelectedFinalization("")}>
          <div className="bg-card border border-border rounded-lg p-4 w-[450px] max-h-[60vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground text-lg">Finalizações Rápidas</h3>
              <button onClick={() => setSelectedFinalization("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Digite parte do título ou da descrição para localizar a finalização:</p>
            <label htmlFor="quick-finalization-search" className="sr-only">Buscar finalização rápida</label>
            <input
              id="quick-finalization-search"
              autoFocus
              value={finalizationSearch}
              onChange={(event) => setFinalizationSearch(event.target.value)}
              placeholder="Buscar por título ou descrição..."
              className="mb-3 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <div className="space-y-2">
              {quickFinalizationOptions.map((f: any) => (
                <button
                  key={f.id}
                  className="w-full text-left px-3 py-2 rounded border border-border hover:bg-primary/10 hover:border-primary/50 transition-colors"
                  onClick={() => {
                    setAttendingNotes((prev) => prev ? `${prev}\n${f.description || f.title}` : (f.description || f.title));
                    setSelectedFinalization("");
                    addLog(`Finalização: ${f.title}`);
                    toast.success(`Finalização "${f.title}" inserida`);
                  }}
                >
                  <span className="font-bold text-sm text-foreground">{f.title}</span>
                  {f.description && <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>}
                </button>
              ))}
              {quickFinalizationOptions.length === 0 && (
                <p className="py-4 text-center text-muted-foreground">{finalizationSearch.trim() ? "Nenhuma finalização encontrada para essa busca." : "Nenhuma finalização cadastrada. Acesse o menu \"Finalizações\" para criar."}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {quickScheduleSystem && <QuickScheduleExceptionDialog
        system={quickScheduleSystem}
        onClose={() => setQuickScheduleSystem(null)}
        onSaved={() => {
          void utils.dashboard.scheduleAlerts.invalidate();
          void utils.dashboard.armDisarmStatus.invalidate();
        }}
      />}
    </DashboardLayout>
  );
}
