import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSocket, AlarmEvent } from "@/hooks/useSocket";
import {
  Bell, Phone, PhoneCall, Shield, Camera, FileText, Truck, X,
  CheckCircle2, Ban, AlertTriangle, Users, Eye, Wrench, ChevronLeft,
  ChevronRight, Clock, Wifi, WifiOff, Send, Mail, Plus, MapPin, Maximize2,
  LogOut, Volume2, VolumeX, CarFront, Headphones,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import HLSPlayer from "@/components/HLSPlayer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type QueueStatus = "waiting" | "attending" | "observing" | "tactical" | "maintenance";

interface QueueEvent extends AlarmEvent {
  receivedAt?: string;
  incidentId?: number;
  queueStatus: QueueStatus;
  queuedAt: number;
  observationUntil?: string | Date | null;
  clientName?: string;
  systemModel?: string;
  zoneName?: string;
}

// Modal de câmera expandida
function CameraModal({ cam, onClose, url, label }: { cam: number; onClose: () => void; url?: string; label?: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
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
  const [queues, setQueues] = useState<QueueEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<QueueEvent | null>(null);
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
  const [connectionStatusModal, setConnectionStatusModal] = useState<'online' | 'offline' | null>(null);
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
  const [observationOpen, setObservationOpen] = useState(false);
  const [observationUntil, setObservationUntil] = useState(() => dateTimeLocalValue(new Date(Date.now() + 30 * 60_000)));
  const [observationNotes, setObservationNotes] = useState("");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceStartAt, setMaintenanceStartAt] = useState(() => dateTimeLocalValue(new Date()));
  const [maintenanceEndAt, setMaintenanceEndAt] = useState(() => dateTimeLocalValue(new Date(Date.now() + 60 * 60_000)));
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [expandedQueue, setExpandedQueue] = useState<Exclude<QueueStatus, "waiting"> | null>(null);
  const [collapsedWaitingAccounts, setCollapsedWaitingAccounts] = useState<Set<string>>(() => new Set());

  // Mutations
  const createOccurrenceMut = trpc.occurrence.create.useMutation();
  const createManualEventMut = trpc.alarmEvent.createManual.useMutation();
  const updateIncidentMut = trpc.incident.update.useMutation();
  const observeIncidentMut = trpc.incident.observe.useMutation();
  const startMaintenanceMut = trpc.alarmSystem.startMaintenance.useMutation();
  const endMaintenanceMut = trpc.alarmSystem.endMaintenance.useMutation();
  const passwordConfirmationMut = trpc.auth.login.useMutation();
  const { data: finalizacoes = [] } = trpc.finalization.list.useQuery(undefined);
  const [selectedFinalization, setSelectedFinalization] = useState<string>("");
  const [treatmentPanel, setTreatmentPanel] = useState<"contacts" | "users" | null>(null);
  const utils = trpc.useUtils();

  const { connected, realtimeEvents } = useSocket();

  // Queries
  const { data: persistedQueueData, isLoading: isPersistedQueueLoading } = trpc.incident.openQueue.useQuery(undefined, {
    refetchInterval: 5000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const { data: clientData } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: systemData } = trpc.alarmSystem.list.useQuery(undefined);
  const { data: armDisarmData } = trpc.dashboard.armDisarmStatus.useQuery(undefined, { refetchInterval: 30000 });
  const { data: recentAutoFinalizedArmDisarm } = trpc.dashboard.recentAutoFinalizedArmDisarm.useQuery(undefined, { refetchInterval: 15000 });
  const { data: connectionSystemsData } = trpc.dashboard.connectionStatus.useQuery(undefined, { refetchInterval: 15000 });
  const persistedQueue = persistedQueueData ?? EMPTY_QUEUE;
  const connectionSystems = connectionSystemsData ?? EMPTY_CONNECTION_SYSTEMS;

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

  // Processar novos eventos em tempo real
  useEffect(() => {
    if (realtimeEvents.length === 0) return;
    const newEvents: QueueEvent[] = [];
    realtimeEvents.forEach((ev) => {
      const persistedEvent = ev as typeof ev & { incidentId?: number };
      if (ev.kind === "restoration_closed") {
        const closeKey = `restoration-${ev.originalEventId}-${ev.id}`;
        if (!processedIds.current.has(closeKey)) {
          processedIds.current.add(closeKey);
          setQueues((prev) => prev.filter((queued: any) => queued.id !== ev.originalEventId));
          if (selectedEvent?.id === ev.originalEventId) setSelectedEvent(null);
          toast.success("Finalizado com a restauração do evento");
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
        const system = (systemData || []).find((s: any) => s.account === ev.account);
        const client = system ? (clientData || []).find((c: any) => c.id === system.clientId) : null;
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
      const signature = persistedQueue.map((ev: any) => `${ev.incidentId}:${ev.incidentStatus}:${ev.observationUntil || ""}:${ev.receivedAt}`).join("|");
      if (signature === persistedQueueSignatureRef.current) return;
      const initial: QueueEvent[] = persistedQueue.map((ev: any) => {
        const system = (systemData || []).find((s: any) => s.account === ev.account);
        const client = system ? (clientData || []).find((c: any) => c.id === system.clientId) : null;
        const evKey = `${ev.account}-${ev.eventCode}-${ev.receivedAt}`;
        processedIds.current.add(evKey);
        return {
          ...ev,
          queueStatus: incidentStatusToQueueStatus(ev.incidentStatus),
          queuedAt: new Date(ev.receivedAt).getTime(),
          observationUntil: ev.observationUntil || null,
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
    }
  }, [persistedQueueData, isPersistedQueueLoading, clientData, systemData]);

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
  }, [queues]);

  function closePendingPopup() {
    setPendingPopup(false);
    stopAlertSound();
    if (pendingPopupTimeoutRef.current) {
      clearTimeout(pendingPopupTimeoutRef.current);
      pendingPopupTimeoutRef.current = null;
    }
  }

  // Mover evento entre filas
  const moveEvent = useCallback((ev: QueueEvent, newStatus: QueueStatus) => {
    setQueues((prev) => prev.map((q) =>
      q === ev || (q.queuedAt === ev.queuedAt && q.account === ev.account) ? { ...q, queueStatus: newStatus } : q
    ));
    if (selectedEvent && selectedEvent.queuedAt === ev.queuedAt && selectedEvent.account === ev.account) {
      setSelectedEvent({ ...ev, queueStatus: newStatus });
    }
    if (ev.incidentId) {
      updateIncidentMut.mutate({ id: ev.incidentId, status: queueStatusToIncidentStatus(newStatus), operatorId: user?.id });
      void utils.incident.openQueue.invalidate();
    }
  }, [selectedEvent, updateIncidentMut, user?.id, utils]);

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
    return queues.filter(q => q.account === ev.account && q !== ev).length;
  }

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs((prev) => [`[${time}] ${msg}`, ...prev]);
  }

  function handleSelectEvent(ev: QueueEvent) {
    // Parar som de alerta ao clicar no evento
    stopAlertSound();
    if (ev.queueStatus === "waiting") {
      moveEvent(ev, "attending");
      setSelectedEvent({ ...ev, queueStatus: "attending" });
      addLog("Evento aberto para atendimento");
    } else {
      setSelectedEvent(ev);
    }
    setAttendStartTime(Date.now());
    setAttendingNotes("");
    setLogs([]);
    setActiveTab("cameras");
  }

  // Encontrar cliente/sistema
  const selectedSystem = useMemo(() => {
    if (!selectedEvent) return null;
    const systems = systemData || [];
    const normalizeAccount = (value?: string | null) => (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const eventAccount = normalizeAccount(selectedEvent.account);
    const eventBrand = normalizeAccount(selectedEvent.brand);
    return systems.find((system: any) => system.id === selectedEvent.alarmSystemId)
      || systems.find((system: any) => normalizeAccount(system.account) === eventAccount)
      || systems.find((system: any) => {
        const systemAccount = normalizeAccount(system.account);
        const accountsMatchBySuffix = eventAccount.length >= 4
          && systemAccount.length >= 4
          && systemAccount.slice(-4) === eventAccount.slice(-4);
        return accountsMatchBySuffix && (!eventBrand || normalizeAccount(system.brand) === eventBrand);
      })
      || null;
  }, [selectedEvent, systemData]);

  const selectedClient = useMemo(() => {
    if (!selectedSystem) return null;
    return (clientData || []).find((c: any) => c.id === selectedSystem.clientId);
  }, [selectedSystem, clientData]);

  const { data: treatmentContacts = [] } = trpc.clientContact.list.useQuery(
    { clientId: selectedClient?.id || 0, alarmSystemId: selectedSystem?.id || 0 },
    { enabled: !!selectedClient?.id && !!selectedSystem?.id }
  );
  const { data: treatmentZones = [] } = trpc.alarmZone.list.useQuery(
    { alarmSystemId: selectedSystem?.id || 0 },
    { enabled: !!selectedSystem?.id }
  );
  const { data: treatmentAlarmUsers = [] } = trpc.alarmUser.list.useQuery(
    { alarmSystemId: selectedSystem?.id || 0 },
    { enabled: !!selectedSystem?.id }
  );

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
    if (!selectedEvent?.incidentId) return;
    const until = new Date(observationUntil);
    if (Number.isNaN(until.getTime()) || until <= new Date()) {
      toast.error("Informe uma data e hora futura para a observação.");
      return;
    }
    try {
      await observeIncidentMut.mutateAsync({ incidentId: selectedEvent.incidentId, until, notes: observationNotes || undefined });
      setQueues((previous) => previous.map((event) => event.incidentId === selectedEvent.incidentId
        ? { ...event, queueStatus: "observing", observationUntil: until }
        : event));
      setSelectedEvent((previous) => previous ? { ...previous, queueStatus: "observing", observationUntil: until } : previous);
      setObservationOpen(false);
      await utils.incident.openQueue.invalidate();
      toast.success("Ocorrência enviada para observação até o horário informado.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível iniciar a observação.");
    }
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
    if (!selectedSystem) return;
    const startAt = new Date(maintenanceStartAt);
    const endAt = new Date(maintenanceEndAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      toast.error("Informe um período de manutenção válido.");
      return;
    }
    try {
      const maintenanceResult = await startMaintenanceMut.mutateAsync({
        systemId: selectedSystem.id,
        incidentId: selectedEvent?.incidentId,
        startAt,
        endAt,
        notes: maintenanceNotes || undefined,
      });
      setQueues((previous) => {
        const matching = previous.filter((event) => event.account === selectedSystem.account || (event as any).alarmSystemId === selectedSystem.id);
        if (matching.length > 0) {
          return previous.map((event) => event.account === selectedSystem.account || (event as any).alarmSystemId === selectedSystem.id
            ? { ...event, queueStatus: "maintenance" }
            : event);
        }
        const source = selectedEvent;
        if (!source) return previous;
        return [...previous, {
          ...source,
          incidentId: maintenanceResult.incidentId,
          account: selectedSystem.account,
          clientName: selectedClient ? (selectedClient.fantasyName || selectedClient.name) : source.clientName,
          systemModel: `${selectedSystem.brand} ${selectedSystem.model || ""}`.trim(),
          description: "Sistema em manutenção",
          queueStatus: "maintenance",
          queuedAt: Date.now(),
        }];
      });
      setSelectedEvent((previous) => previous ? { ...previous, queueStatus: "maintenance" } : previous);
      setMaintenanceOpen(false);
      await Promise.all([utils.incident.openQueue.invalidate(), utils.alarmSystem.list.invalidate()]);
      toast.success("Sistema colocado em manutenção. Os novos eventos serão finalizados automaticamente no período informado.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível programar a manutenção.");
    }
  }

  async function releaseMaintenance() {
    if (!selectedSystem) return;
    try {
      await endMaintenanceMut.mutateAsync({ systemId: selectedSystem.id });
      setQueues((previous) => previous.map((event) => event.account === selectedEvent?.account && event.queueStatus === "maintenance"
        ? { ...event, queueStatus: "attending" }
        : event));
      setSelectedEvent((previous) => previous?.queueStatus === "maintenance" ? { ...previous, queueStatus: "attending" } : previous);
      await Promise.all([utils.incident.openQueue.invalidate(), utils.alarmSystem.list.invalidate()]);
      toast.success("Sistema retirado da manutenção. Os próximos eventos voltarão a exigir atendimento.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível retirar a manutenção.");
    }
  }

  // Buscar câmeras do cliente selecionado
  const { data: clientCameras } = trpc.camera.list.useQuery(
    { clientId: selectedClient?.id || 0 },
    { enabled: !!selectedClient?.id }
  );

  // Finalizar evento - salvar ocorrência no banco
  const finalizeEvent = useCallback((ev: QueueEvent) => {
    if (!attendingNotes.trim()) {
      toast.error("Preencha a descrição da finalização antes de finalizar!");
      return;
    }
    addLog("Evento FINALIZADO");
    const finalLogs = [`[${new Date().toLocaleTimeString("pt-BR")}] Evento FINALIZADO`, ...logs];
    const attendingTime = Date.now() - attendStartTime;
    createOccurrenceMut.mutate({
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
      observations: attendingNotes || undefined,
      logs: JSON.stringify(finalLogs),
      attendingTimeMs: attendingTime,
      sendEmail: sendEmail,
      sendPush: sendPush,
      startedAt: new Date(attendStartTime),
    }, {
      onSuccess: () => {
        void utils.incident.openQueue.invalidate();
        setQueues((prev) => prev.filter((q) => !(q.queuedAt === ev.queuedAt && q.account === ev.account)));
        setSelectedEvent(null);
        setAttendingNotes("");
        setLogs([]);
        setSendEmail(false);
        setSendPush(false);
        toast.success("Ocorrência finalizada e salva no banco!");
      },
      onError: (err: any) => {
        toast.error("Erro ao salvar ocorrência: " + err.message);
      }
    });
  }, [logs, attendStartTime, attendingNotes, selectedClient, selectedSystem, user, sendEmail, sendPush, utils]);

  const finalizeSameClientEvents = async (ev: QueueEvent) => {
    if (!attendingNotes.trim()) {
      toast.error("Preencha a descrição antes de finalizar os eventos em massa!");
      return;
    }
    const relatedEvents = queues.filter((item) => item.account === ev.account);
    if (relatedEvents.length < 2) {
      toast.info("Não há outros eventos pendentes para esta conta.");
      return;
    }

    const finalizedAt = new Date();
    try {
      await Promise.all(relatedEvents.flatMap((item) => [createOccurrenceMut.mutateAsync({
        incidentId: item.incidentId || undefined,
        account: item.account,
        eventCode: item.eventCode,
        qualifier: item.qualifier || undefined,
        partition: item.partition || undefined,
        zoneUser: item.zoneUser || undefined,
        description: item.description || undefined,
        priority: item.priority || undefined,
        brand: item.brand || item.systemModel || undefined,
        clientId: selectedClient?.id || undefined,
        clientName: item.clientName || undefined,
        systemId: selectedSystem?.id || undefined,
        partnerCompanyId: (selectedClient as any)?.partnerCompanyId || undefined,
        operatorId: user?.id || undefined,
        operatorName: user?.name || undefined,
        observations: attendingNotes,
        logs: JSON.stringify([`[${finalizedAt.toLocaleTimeString("pt-BR")}] Finalização em massa: ${relatedEvents.length} eventos da mesma conta`]),
        attendingTimeMs: Math.max(0, finalizedAt.getTime() - attendStartTime),
        sendEmail,
        sendPush,
        startedAt: new Date(attendStartTime),
      })]));
      await utils.incident.openQueue.invalidate();
      setQueues((previous) => previous.filter((item) => item.account !== ev.account));
      setSelectedEvent(null);
      setAttendingNotes("");
      setLogs([]);
      setBulkFinalizeOpen(false);
      toast.success(`${relatedEvents.length} eventos da conta ${ev.account} foram finalizados.`);
    } catch (error: any) {
      toast.error("Não foi possível finalizar todos os eventos: " + error.message);
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

  // Card do evento
  function EventCard({ ev, groupedCard = false }: { ev: QueueEvent; groupedCard?: boolean }) {
    const sameClientCount = countSameClient(ev);
    const pri = PRIORITY_LABELS[ev.priority] || PRIORITY_LABELS.medium;
    const time = ev.receivedAt ? new Date(ev.receivedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
    const isNew = ev.queueStatus === "waiting" && Date.now() - ev.queuedAt < 90_000;

    return (
      <div
        onClick={() => handleSelectEvent(ev)}
        className={`w-full min-w-0 rounded-md border border-border/50 px-3 py-2 cursor-pointer hover:bg-primary/10 transition-colors relative border-l-4 shadow-sm ${
          selectedEvent?.queuedAt === ev.queuedAt && selectedEvent?.account === ev.account ? 'bg-primary/15 border-l-primary' : (PRIORITY_BORDER[ev.priority] || PRIORITY_BORDER.medium)
        }`}
      >
        {sameClientCount > 0 && !groupedCard && (
          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">{sameClientCount + 1}</span>
          </div>
        )}
        <div className="flex items-center gap-2 pr-8">
          <div className="text-xs text-muted-foreground font-mono">{time}</div>
          {isNew && <Badge className="bg-red-600 px-1.5 py-0 text-[9px] font-bold text-white">NOVO</Badge>}
        </div>
        <div className={`mt-0.5 font-bold text-sm ${PRIORITY_TEXT_COLOR[ev.priority] || 'text-foreground'}`}>{ev.description || `Evento ${ev.eventCode}`}</div>
        <div className="mt-0.5 text-sm text-primary font-semibold"><span className="font-mono tracking-[0.12em]">{ev.account}</span> <span className="text-muted-foreground">·</span> {ev.clientName}</div>
        <div className="text-[11px] text-muted-foreground truncate">Central: {ev.systemModel}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-mono text-xs text-muted-foreground">{ev.qualifier === 'E' ? '' : 'R'}{ev.eventCode}</span>
          <Badge className={`text-[10px] px-1.5 py-0 ${pri.color}`}>{pri.label}</Badge>
        </div>
        {ev.observationUntil && ev.queueStatus === "observing" && (
          <div className="text-[10px] text-purple-300 mt-1">Observação até {new Date(ev.observationUntil).toLocaleString("pt-BR")}</div>
        )}
        {sameClientCount > 0 && !groupedCard && (
          <div className="text-[10px] text-cyan-400 mt-1">+ {sameClientCount} eventos do mesmo cliente</div>
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

  // Mantido temporariamente oculto enquanto o novo popup de tratamento substitui o painel lateral.
  const legacySelectedEvent = selectedEvent as QueueEvent;
  const legacySelectedClient = selectedClient as any;

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

      {selectedEvent && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-5" onClick={() => setSelectedEvent(null)}>
          <div className="flex h-[min(780px,92vh)] w-[min(1080px,94vw)] flex-col overflow-hidden rounded-xl border border-primary/35 bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
                  <p className={`mt-1 font-bold text-lg ${PRIORITY_TEXT_COLOR[selectedEvent.priority] || 'text-foreground'}`}>{selectedEvent.qualifier}{selectedEvent.eventCode} - {selectedEvent.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Timer startTime={attendStartTime} />
                <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setSelectedEvent(null)} aria-label="Fechar tratamento"><X className="h-5 w-5" /></button>
              </div>
            </div>
            {selectedEvent.queueStatus === "maintenance" ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="max-w-lg rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-6 text-center">
                  <Wrench className="mx-auto mb-3 h-10 w-10 text-yellow-400" />
                  <h3 className="text-lg font-bold text-yellow-200">Sistema em manutenção</h3>
                  <p className="mt-2 text-sm text-muted-foreground">A ocorrência permanece preservada exclusivamente na fila de manutenção durante o período programado.</p>
                  <Button className="mt-5 bg-red-600 hover:bg-red-700" onClick={() => void releaseMaintenance()} disabled={endMaintenanceMut.isPending}><Wrench className="mr-2 h-4 w-4" /> {endMaintenanceMut.isPending ? "Retirando..." : "Retirar manutenção agora"}</Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="grid gap-4 border-b border-border px-5 py-4 lg:grid-cols-[1fr_auto]">
                  <Textarea className="min-h-[108px] resize-none text-sm" placeholder="Registro do atendimento, contatos realizados e providências..." value={attendingNotes} onChange={(event) => setAttendingNotes(event.target.value)} />
                  <div className="flex min-w-[180px] flex-col gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"><input type="checkbox" className="h-3.5 w-3.5 rounded border-border" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} /><Mail className="h-3 w-3" /> E-mail</label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"><input type="checkbox" className="h-3.5 w-3.5 rounded border-border" checked={sendPush} onChange={(event) => setSendPush(event.target.checked)} /><Send className="h-3 w-3" /> Push</label>
                    <Button size="sm" className="mt-auto bg-green-600 hover:bg-green-700" onClick={() => finalizeEvent(selectedEvent)}>Finalizar</Button>
                    <Button size="sm" variant="outline" className="border-blue-500/50 text-blue-300 hover:bg-blue-500/10" onClick={() => setSelectedFinalization("open")}><FileText className="mr-1 h-3.5 w-3.5" /> Finalização Rápida</Button>
                    {queues.filter((item) => item.account === selectedEvent.account).length > 1 && <Button size="sm" variant="outline" className="border-orange-500/50 text-orange-400" onClick={() => setBulkFinalizeOpen(true)}>Finalizar em massa ({queues.filter((item) => item.account === selectedEvent.account).length})</Button>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 border-b border-border px-5 py-2.5">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={openObservation}><Eye className="h-3.5 w-3.5" /> Observação</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-emerald-400" onClick={() => setTreatmentPanel("contacts")}><Phone className="h-3.5 w-3.5" /> Contatos ({treatmentContacts.length})</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-blue-400" onClick={() => setTreatmentPanel("users")}><Users className="h-3.5 w-3.5" /> Usuários ({treatmentAlarmUsers.length})</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-orange-400" onClick={() => { moveEvent(selectedEvent, "tactical"); addLog("Tático despachado"); }}><CarFront className="h-3.5 w-3.5" /> Tático</Button>
                  <Button variant="ghost" size="sm" className={`gap-1.5 text-xs ${selectedSystemInMaintenance ? "text-red-400" : "text-yellow-400"}`} onClick={() => selectedSystemInMaintenance ? void releaseMaintenance() : openMaintenance()} disabled={endMaintenanceMut.isPending}><Wrench className="h-3.5 w-3.5" /> {selectedSystemInMaintenance ? "Retirar Manutenção" : "Manutenção"}</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-red-400" onClick={() => { addLog("Polícia acionada"); toast.info("Polícia acionada"); }}><Shield className="h-3.5 w-3.5" /> Polícia</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-cyan-400" onClick={() => { addLog(`Zona ${selectedEvent.zoneUser} isolada`); toast.info("Zona isolada"); }}><Ban className="h-3.5 w-3.5" /> Isolar Zona</Button>
                </div>
                <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[0.85fr_1.15fr]">
                  <div className="rounded-lg border border-border bg-black/15 p-4"><h3 className="mb-3 text-sm font-bold text-foreground">Providências e histórico</h3>{logs.length === 0 ? <p className="text-sm text-muted-foreground">Registre acima cada contato e providência tomada durante o atendimento.</p> : <div className="space-y-1.5">{logs.map((log, index) => <p key={index} className="font-mono text-xs text-muted-foreground">{log}</p>)}</div>}</div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-black/15 p-4"><h3 className="mb-3 text-sm font-bold text-foreground">Dados do sistema</h3><div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2"><p>Central: <span className="text-foreground">{selectedEvent.systemModel}</span></p><p>Porta: <span className="font-mono text-foreground">{selectedEvent.receiverPort || "Não informada"}</span></p><p>Zona/usuário: <span className="font-mono text-foreground">{selectedEvent.zoneUser || "Não informado"}</span></p><p>Prioridade: <span className={PRIORITY_TEXT_COLOR[selectedEvent.priority] || "text-foreground"}>{PRIORITY_LABELS[selectedEvent.priority]?.label || "Média"}</span></p></div></div>
                    <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-red-100"><MapPin className="h-4 w-4 text-red-400" /> Zonas e setores</h3><div className="max-h-32 space-y-1.5 overflow-y-auto">{treatmentZones.filter((zone: any) => zone.isActive !== false).map((zone: any) => <div key={zone.id} className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs ${String(zone.zoneNumber) === String(selectedEvent.zoneUser).replace(/^0+/, "") ? "bg-red-500/15 text-red-100" : "bg-black/20 text-muted-foreground"}`}><span><strong className="font-mono">Zona {String(zone.zoneNumber).padStart(3, "0")}</strong> · {zone.name}</span><span className="uppercase text-[10px]">{zone.type}</span></div>)}{treatmentZones.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma zona cadastrada neste sistema.</p>}</div></div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-100"><Phone className="h-4 w-4 text-emerald-400" /> Contatos</h3><div className="max-h-40 space-y-1.5 overflow-y-auto">{treatmentContacts.map((contact: any) => <div key={contact.id} className="rounded bg-black/20 px-2.5 py-1.5 text-xs"><p className="font-semibold text-foreground">{contact.name} <span className="font-normal text-muted-foreground">{contact.role ? `· ${contact.role}` : ""}</span></p><p className="mt-0.5 font-mono text-emerald-300">{contact.phone || contact.whatsapp || contact.email || "Sem telefone cadastrado"}</p></div>)}{treatmentContacts.length === 0 && <p className="text-xs text-muted-foreground">Nenhum contato cadastrado neste sistema.</p>}</div></div>
                      <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-100"><Users className="h-4 w-4 text-blue-400" /> Usuários do painel</h3><div className="max-h-40 space-y-1.5 overflow-y-auto">{treatmentAlarmUsers.map((panelUser: any) => <div key={panelUser.id} className="flex items-center justify-between rounded bg-black/20 px-2.5 py-1.5 text-xs"><span><strong className="font-mono text-blue-300">{String(panelUser.userNumber).padStart(2, "0")}</strong> · <span className="font-semibold text-foreground">{panelUser.name}</span></span><span className="text-muted-foreground">{panelUser.phone || (panelUser.isActive === false ? "Inativo" : "Ativo")}</span></div>)}{treatmentAlarmUsers.length === 0 && <p className="text-xs text-muted-foreground">Nenhum usuário programado neste sistema.</p>}</div></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {treatmentPanel && selectedEvent && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-5" onClick={() => setTreatmentPanel(null)}>
          <div className="max-h-[82vh] w-[min(720px,94vw)] overflow-hidden rounded-xl border border-primary/35 bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className={`flex items-start justify-between border-b border-border px-5 py-4 ${treatmentPanel === "contacts" ? "bg-emerald-500/10" : "bg-blue-500/10"}`}>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Conta {selectedEvent.account} · {selectedEvent.systemModel}</p>
                <h3 className="mt-1 flex items-center gap-2 text-lg font-bold text-foreground">
                  {treatmentPanel === "contacts" ? <Phone className="h-5 w-5 text-emerald-400" /> : <Users className="h-5 w-5 text-blue-400" />}
                  {treatmentPanel === "contacts" ? "Contatos para atendimento" : "Usuários programados no painel"}
                </h3>
              </div>
              <button type="button" onClick={() => setTreatmentPanel(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar painel"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[68vh] overflow-y-auto p-5">
              {treatmentPanel === "contacts" ? (
                <div className="space-y-3">
                  {treatmentContacts.map((contact: any) => {
                    const phone = contact.phone || "";
                    const whatsapp = contact.whatsapp || phone;
                    const digits = String(phone).replace(/\D/g, "");
                    const whatsappDigits = String(whatsapp).replace(/\D/g, "");
                    const whatsappInternational = whatsappDigits.startsWith("55") ? whatsappDigits : `55${whatsappDigits}`;
                    return <div key={contact.id} className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-foreground">{contact.name}</p><p className="mt-0.5 text-sm text-muted-foreground">{contact.role || "Contato do sistema"}</p></div><div className="flex flex-wrap gap-2">{phone && <a href={`tel:${digits}`} className="rounded-md border border-emerald-500/45 px-3 py-1.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/15">Ligar</a>}{whatsappDigits && <a href={`https://wa.me/${whatsappInternational}`} target="_blank" rel="noreferrer" className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400">WhatsApp</a>}</div></div>
                      <div className="mt-3 grid gap-1.5 text-sm"><p className="font-mono text-emerald-300">{phone || whatsapp || "Telefone não informado"}</p>{contact.email && <p className="text-muted-foreground">{contact.email}</p>}</div>
                    </div>;
                  })}
                  {treatmentContacts.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum contato cadastrado para esta central.</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  {treatmentAlarmUsers.map((panelUser: any) => <div key={panelUser.id} className="flex items-center justify-between gap-3 rounded-lg border border-blue-500/25 bg-blue-500/5 p-4"><div className="flex items-center gap-3"><span className="rounded-md bg-blue-500/15 px-2 py-1 font-mono font-bold tracking-[0.15em] text-blue-300">{String(panelUser.userNumber).padStart(2, "0")}</span><div><p className="font-bold text-foreground">{panelUser.name}</p><p className="mt-0.5 text-sm text-muted-foreground">{panelUser.phone || "Telefone não informado"}</p></div></div><span className={panelUser.isActive === false ? "text-sm text-red-300" : "text-sm text-emerald-300"}>{panelUser.isActive === false ? "Inativo" : "Ativo"}</span></div>)}
                  {treatmentAlarmUsers.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum usuário programado para esta central.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col h-[calc(100vh-1px)] overflow-hidden">
        {/* TOP BAR - Botões de Status */}
        <div className="h-12 min-h-12 border-b border-border bg-card flex items-center justify-between px-4">
          <Button type="button" variant="outline" size="sm" className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10" onClick={openManualOccurrence}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Ocorrência Manual
          </Button>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => audioEnabled ? requestAudioDeactivation() : enableAlertAudio()}
              className={audioEnabled
                ? "border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
                : audioActivationNeeded
                  ? "border-amber-400 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 animate-pulse"
                  : "border-amber-400 text-amber-200 hover:bg-amber-500/15"}
              title={audioEnabled ? "Para desativar, informe a senha do usuário logado" : "Ative uma vez após entrar no sistema para permitir alertas sonoros"}
            >
              {audioEnabled ? <Volume2 className="h-3.5 w-3.5 mr-1" /> : <VolumeX className="h-3.5 w-3.5 mr-1" />}
              {audioEnabled ? "Áudio ativo" : "Ativar áudio"}
            </Button>
            <Button variant="outline" size="sm" className="border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold" onClick={() => setArmDisarmModal('disarmed')}>
              <WifiOff className="h-3.5 w-3.5 mr-1" /> Desarmados ({armDisarmData?.disarmed?.length || 0})
            </Button>
            <Button variant="outline" size="sm" className="border-green-500/50 text-green-400 hover:bg-green-500/10 font-bold" onClick={() => setArmDisarmModal('armed')}>
              <Shield className="h-3.5 w-3.5 mr-1" /> Armados ({armDisarmData?.armed?.length || 0})
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white font-bold" onClick={() => setConnectionStatusModal("online")}>
              <Wifi className="h-3.5 w-3.5 mr-1" /> Online ({onlineSystems.length})
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold" onClick={() => setConnectionStatusModal("offline")}>
              <WifiOff className="h-3.5 w-3.5 mr-1" /> Offline ({offlineSystems.length})
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
        <div className="flex flex-1 overflow-hidden">
          {/* SELETOR COMPACTO DAS FILAS RECOLHIDAS */}
          <div className="w-[76px] min-w-[76px] h-full border-r border-border bg-card flex flex-col items-center gap-2 px-2 py-3">
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

          {/* FILA PRINCIPAL: SEMPRE ABERTA */}
          <div className="flex-1 min-w-[620px] h-full border-r border-border bg-card flex flex-col">
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
          </div>

          {/* ÁREA DE CONTEXTO: O TRATAMENTO É ABERTO NO POPUP */}
          <div className="hidden flex-1 h-full flex-col overflow-hidden min-h-0">
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg">Selecione um evento na fila para atender</p>
                <p className="mt-1 text-sm text-muted-foreground/70">O tratamento será aberto em uma janela operacional segura.</p>
              </div>
            </div>
            {selectedEvent && false && (
              <div className="flex flex-col h-full">
                {/* HEADER DO EVENTO */}
                <div className="px-4 py-3 border-b border-border bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className={`h-5 w-5 ${legacySelectedEvent.qualifier === 'E' ? 'text-red-400' : 'text-green-400'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 font-bold">Conta {legacySelectedEvent.account}</span>
                          <span className="text-foreground font-bold">{legacySelectedClient?.name || legacySelectedEvent.clientName}</span>
                          {legacySelectedClient?.fantasyName && <span className="text-cyan-400">- {legacySelectedClient.fantasyName}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`font-bold text-lg ${PRIORITY_TEXT_COLOR[legacySelectedEvent.priority] || 'text-foreground'}`}>
                            {legacySelectedEvent.qualifier}{legacySelectedEvent.eventCode} - {legacySelectedEvent.description}
                          </span>
                          <span className="text-muted-foreground">- Zona {legacySelectedEvent.zoneUser}</span>
                          {legacySelectedEvent.zoneName && <span className="text-foreground ml-1">{legacySelectedEvent.zoneName}</span>}
                        </div>
                      </div>
                    </div>
                    <Timer startTime={attendStartTime} />
                  </div>
                </div>

                {legacySelectedEvent.queueStatus === "maintenance" && (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="max-w-lg rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-6 text-center">
                      <Wrench className="mx-auto h-10 w-10 text-yellow-400 mb-3" />
                      <h3 className="text-lg font-bold text-yellow-200">Sistema em manutenção</h3>
                      <p className="mt-2 text-sm text-muted-foreground">A ocorrência está preservada exclusivamente na fila de manutenção. Ela não pode ser tratada, finalizada ou duplicada no relatório enquanto o período estiver ativo.</p>
                      <Button className="mt-5 bg-red-600 hover:bg-red-700" onClick={() => void releaseMaintenance()} disabled={endMaintenanceMut.isPending}>
                        <Wrench className="mr-2 h-4 w-4" /> {endMaintenanceMut.isPending ? "Retirando..." : "Retirar manutenção agora"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* OBSERVAÇÕES */}
                <div className={`px-4 py-2 border-b border-border ${legacySelectedEvent.queueStatus === "maintenance" ? "hidden" : ""}`}>
                  <div className="flex items-start gap-3">
                    <Textarea
                      className="flex-1 min-h-[60px] max-h-[80px] text-sm resize-none"
                      placeholder="Observações..."
                      value={attendingNotes}
                      onChange={(e) => setAttendingNotes(e.target.value)}
                    />
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-border" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                        <Mail className="h-3 w-3" /> E-mail
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-border" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
                        <Send className="h-3 w-3" /> Push
                      </label>
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 mt-1" onClick={() => finalizeEvent(legacySelectedEvent)}>
                        Finalizar
                      </Button>
                      {queues.filter((item) => item.account === legacySelectedEvent.account).length > 1 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs mt-1 w-full border-orange-500/50 text-orange-400" onClick={() => setBulkFinalizeOpen(true)}>
                          Finalizar em massa ({queues.filter((item) => item.account === legacySelectedEvent.account).length})
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs mt-1 w-full border-blue-500/50 text-blue-400" onClick={() => setSelectedFinalization("open")}>
                        Finalização Rápida
                      </Button>
                    </div>
                  </div>
                </div>

                {/* BARRA DE AÇÕES */}
                <div className={`px-4 py-2 border-b border-border flex items-center gap-1 flex-wrap ${legacySelectedEvent.queueStatus === "maintenance" ? "hidden" : ""}`}>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setActiveTab("cameras"); toast.info("Providências"); }}>
                    <FileText className="h-3.5 w-3.5" /> Providências
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setActiveTab("cameras")}>
                    <Camera className="h-3.5 w-3.5" /> Câmeras
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-red-400" onClick={() => { addLog("Polícia acionada"); toast.info("Polícia acionada"); }}>
                    <Shield className="h-3.5 w-3.5" /> Polícia
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={openObservation}>
                    <Eye className="h-3.5 w-3.5" /> Observação
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-orange-400" onClick={() => { moveEvent(legacySelectedEvent, "tactical"); addLog("Tático despachado"); }}>
                    <Truck className="h-3.5 w-3.5" /> Tático
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 text-xs gap-1.5 ${selectedSystemInMaintenance ? "text-red-400" : "text-yellow-400"}`}
                    onClick={() => selectedSystemInMaintenance ? void releaseMaintenance() : openMaintenance()}
                    disabled={endMaintenanceMut.isPending}
                  >
                    <Wrench className="h-3.5 w-3.5" /> {selectedSystemInMaintenance ? "Retirar Manutenção" : "Manutenção"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-green-400" onClick={() => { addLog("Comando DESARMAR enviado"); toast.info("Comando desarmar enviado"); }}>
                    <Shield className="h-3.5 w-3.5" /> Desarmar
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-cyan-400" onClick={() => { addLog(`Zona ${legacySelectedEvent.zoneUser} isolada`); toast.info("Zona isolada"); }}>
                    <Ban className="h-3.5 w-3.5" /> Isolar Zona
                  </Button>
                </div>

                {/* CÂMERAS / CONTEÚDO */}
                <div className={`flex-1 px-4 py-2 overflow-hidden flex flex-col ${legacySelectedEvent.queueStatus === "maintenance" ? "hidden" : ""}`}>
                  {/* Carrossel de Câmeras - logo abaixo dos botões de ação */}
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setCamPage(Math.max(0, camPage - 1))}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={camPage === 0}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <div className="flex-1 grid grid-cols-4 gap-3">
                      {Array.from({ length: camsPerPage }, (_, i) => {
                        const camNum = camPage * camsPerPage + i + 1;
                        const camData = clientCameras?.[camPage * camsPerPage + i];
                        return (
                          <div
                            key={camNum}
                            onClick={() => { setExpandedCam(camNum); addLog(`Visualizou Câmera ${camNum}${camData?.name ? ` (${camData.name})` : ''}`); }}
                            className="border border-border rounded-lg flex flex-col items-center justify-center bg-black/50 cursor-pointer hover:border-primary/50 hover:bg-black/70 transition-colors relative group aspect-[4/3] max-h-[140px]"
                          >
                            {camData?.rtspUrl ? (
                              <HLSPlayer url={camData.rtspUrl} label={camData.name || `Câmera ${camNum}`} className="w-full h-full" />
                            ) : (
                              <>
                                <Camera className="h-8 w-8 text-muted-foreground mb-1" />
                                <span className="text-muted-foreground text-sm font-medium">{camData?.name || `Câmera ${camNum}`}</span>
                              </>
                            )}
                            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setCamPage(Math.min(Math.ceil(totalCams / camsPerPage) - 1, camPage + 1))}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={camPage >= Math.ceil(totalCams / camsPerPage) - 1}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </div>

                  {/* Abas: Contatos / Setor-Zona */}
                  <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
                    <button
                      onClick={() => setActiveTab("contacts")}
                      className={`flex items-center gap-1.5 text-sm font-medium pb-1 border-b-2 transition-colors ${activeTab === 'contacts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    >
                      <Phone className="h-3.5 w-3.5" /> Contatos
                    </button>
                    <button
                      onClick={() => setActiveTab("zones")}
                      className={`flex items-center gap-1.5 text-sm font-medium pb-1 border-b-2 transition-colors ${activeTab === 'zones' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    >
                      <MapPin className="h-3.5 w-3.5" /> Setor/Zona
                    </button>
                  </div>

                  {/* Conteúdo da aba */}
                  {activeTab === "contacts" && (
                    <div className="mt-2 space-y-1.5 max-h-[100px] overflow-auto">
                      {legacySelectedClient?.phone ? (
                        <div className="flex items-center justify-between bg-secondary/30 rounded px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-mono">{legacySelectedClient.phone}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-xs"><PhoneCall className="h-3 w-3 mr-1" />Ligar</Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Nenhum contato cadastrado</p>
                      )}
                      {legacySelectedClient?.whatsapp && (
                        <div className="flex items-center justify-between bg-secondary/30 rounded px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-green-400" />
                            <span className="text-sm font-mono text-green-400">{legacySelectedClient.whatsapp}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-xs text-green-400">WhatsApp</Button>
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === "zones" && (
                    <div className="mt-2 space-y-1 max-h-[100px] overflow-auto">
                      <div className="flex items-center gap-2 bg-secondary/30 rounded px-3 py-1.5">
                        <span className="text-xs font-mono text-red-400 font-bold">Zona {legacySelectedEvent.zoneUser}</span>
                        <span className="text-xs text-muted-foreground">- Setor em disparo</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* COLUNA 3: Logs da Ocorrência */}
          <div className="w-[220px] min-w-[220px] h-full border-l border-border bg-card flex flex-col">
            <div className="px-3 py-2 border-b border-border">
              <h3 className="text-xs font-bold text-muted-foreground uppercase">Logs da Ocorrência</h3>
            </div>
            <ScrollArea className="flex-1 px-3 py-2">
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Selecione um evento para ver os logs</p>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log, idx) => (
                    <div key={idx} className="text-[11px] text-muted-foreground font-mono leading-tight">{log}</div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
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
              <Button className="bg-purple-600 hover:bg-purple-700" disabled={observeIncidentMut.isPending} onClick={() => void confirmObservation()}>{observeIncidentMut.isPending ? "Salvando..." : "Confirmar observação"}</Button>
            </div>
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
              <Button className="bg-yellow-600 hover:bg-yellow-700 text-black" disabled={startMaintenanceMut.isPending} onClick={() => void confirmMaintenance()}>{startMaintenanceMut.isPending ? "Salvando..." : "Iniciar manutenção"}</Button>
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
            <p className="text-sm text-muted-foreground">Serão finalizados <strong className="text-foreground">{queues.filter((item) => item.account === selectedEvent.account).length} eventos</strong> da conta <strong className="text-foreground">{selectedEvent.account}</strong> com a mesma descrição informada nas observações.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkFinalizeOpen(false)}>Cancelar</Button>
              <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => finalizeSameClientEvents(selectedEvent)}>Confirmar finalização</Button>
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
            <div className="overflow-y-auto max-h-[58vh] p-2">
              {(connectionStatusModal === "online" ? onlineSystems : offlineSystems).map((system: any) => {
                const client = (clientData || []).find((item: any) => item.id === system.clientId);
                return (
                  <div key={system.id} className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 hover:bg-muted/30">
                    <div>
                      <p className="text-sm font-bold text-foreground">{client?.fantasyName || client?.name || "Cliente não identificado"}</p>
                      <p className="text-xs text-muted-foreground">Conta {system.account} · {system.brand} {system.model || ""} · Porta {system.receiverPort || "não definida"}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={connectionStatusModal === "online" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>{connectionStatusModal === "online" ? "ONLINE" : "OFFLINE"}</Badge>
                      <p className="text-[11px] text-muted-foreground mt-1">{system.lastCommunication ? `Última comunicação: ${new Date(system.lastCommunication).toLocaleString("pt-BR")}` : "Sem comunicação registrada"}</p>
                    </div>
                  </div>
                );
              })}
              {(connectionStatusModal === "online" ? onlineSystems : offlineSystems).length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma central encontrada.</p>}
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
            <div className="overflow-y-auto max-h-[60vh] p-2">
              {(armDisarmModal === 'armed' ? armDisarmData?.armed : armDisarmData?.disarmed)?.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2 border-b border-border/50 hover:bg-muted/30">
                  <div>
                    <p className="text-sm font-bold text-foreground">{item.clientName}</p>
                    <p className="text-xs text-muted-foreground">Conta: {item.account}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {item.lastEvent ? new Date(item.lastEvent).toLocaleString('pt-BR') : '-'}
                    </p>
                    <Badge className={armDisarmModal === 'armed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                      {armDisarmModal === 'armed' ? 'ARMADO' : 'DESARMADO'}
                    </Badge>
                  </div>
                </div>
              ))}
              {((armDisarmModal === 'armed' ? armDisarmData?.armed : armDisarmData?.disarmed)?.length || 0) === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</p>
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
            <p className="text-xs text-muted-foreground mb-3">Clique em uma finalização para inserir nas observações:</p>
            <div className="space-y-2">
              {finalizacoes.filter((f: any) => f.isActive).map((f: any) => (
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
              {finalizacoes.filter((f: any) => f.isActive).length === 0 && (
                <p className="text-center text-muted-foreground py-4">Nenhuma finalização cadastrada. Acesse o menu "Finalizações" para criar.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
