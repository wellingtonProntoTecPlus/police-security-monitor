import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSocket, AlarmEvent } from "@/hooks/useSocket";
import {
  Bell, Phone, PhoneCall, Shield, Camera, FileText, Truck, X,
  CheckCircle2, Ban, AlertTriangle, Users, Eye, Wrench, ChevronLeft,
  ChevronRight, Clock, Wifi, WifiOff, Send, Mail, Plus, MapPin, Maximize2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type QueueStatus = "waiting" | "attending" | "observing" | "tactical" | "maintenance";

interface QueueEvent extends AlarmEvent {
  receivedAt?: string;
  queueStatus: QueueStatus;
  queuedAt: number;
  clientName?: string;
  systemModel?: string;
  zoneName?: string;
}

// Modal de câmera expandida
function CameraModal({ cam, onClose }: { cam: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
      <div className="relative w-[80vw] h-[70vh] bg-black border border-border rounded-lg flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-white hover:text-red-400 z-10">
          <X className="h-6 w-6" />
        </button>
        <div className="text-center">
          <Camera className="h-16 w-16 mx-auto text-muted-foreground mb-3" />
          <span className="text-white text-xl font-bold">Câmera {cam}</span>
          <p className="text-muted-foreground text-sm mt-2">Stream RTSP será exibido aqui</p>
        </div>
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

  const { connected, realtimeEvents } = useSocket();

  // Queries
  const { data: dbEvents = [] } = trpc.alarmEvent.list.useQuery({ limit: 50 }, { refetchInterval: 15000 });
  const { data: clientData } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: systemData } = trpc.alarmSystem.list.useQuery(undefined);

  // Processar novos eventos em tempo real
  useEffect(() => {
    if (realtimeEvents.length === 0) return;
    const newEvents: QueueEvent[] = [];
    realtimeEvents.forEach((ev) => {
      const evKey = `${ev.account}-${ev.eventCode}-${ev.timestamp || Date.now()}`;
      if (!processedIds.current.has(evKey)) {
        processedIds.current.add(evKey);
        const system = (systemData || []).find((s: any) => s.account === ev.account);
        const client = system ? (clientData || []).find((c: any) => c.id === system.clientId) : null;
        newEvents.push({
          ...ev,
          queueStatus: "waiting",
          queuedAt: Date.now(),
          clientName: client ? (client.fantasyName || client.name) : `Conta ${ev.account}`,
          systemModel: system ? `${system.brand} ${system.model || ''}`.trim() : ev.brand,
        });
      }
    });
    if (newEvents.length > 0) {
      setQueues((prev) => [...newEvents, ...prev]);
      const hasCritical = newEvents.some(e => e.priority === "critical" || e.priority === "high");
      if (hasCritical) { try { audioRef.current?.play(); } catch {} }
    }
  }, [realtimeEvents, clientData, systemData]);

  // Carregar eventos do banco na inicialização
  useEffect(() => {
    if (dbEvents.length > 0 && queues.length === 0) {
      const initial: QueueEvent[] = dbEvents.map((ev: any) => {
        const system = (systemData || []).find((s: any) => s.account === ev.account);
        const client = system ? (clientData || []).find((c: any) => c.id === system.clientId) : null;
        const evKey = `${ev.account}-${ev.eventCode}-${ev.receivedAt}`;
        processedIds.current.add(evKey);
        return {
          ...ev,
          queueStatus: "waiting" as QueueStatus,
          queuedAt: new Date(ev.receivedAt).getTime(),
          clientName: client ? (client.fantasyName || client.name) : `Conta ${ev.account}`,
          systemModel: system ? `${system.brand} ${system.model || ''}`.trim() : ev.brand,
        };
      });
      setQueues(initial);
    }
  }, [dbEvents, clientData, systemData]);

  // Mover evento entre filas
  const moveEvent = useCallback((ev: QueueEvent, newStatus: QueueStatus) => {
    setQueues((prev) => prev.map((q) =>
      q === ev || (q.queuedAt === ev.queuedAt && q.account === ev.account) ? { ...q, queueStatus: newStatus } : q
    ));
    if (selectedEvent && selectedEvent.queuedAt === ev.queuedAt && selectedEvent.account === ev.account) {
      setSelectedEvent({ ...ev, queueStatus: newStatus });
    }
  }, [selectedEvent]);

  // Finalizar evento
  const finalizeEvent = useCallback((ev: QueueEvent) => {
    addLog("Evento FINALIZADO");
    setQueues((prev) => prev.filter((q) => !(q.queuedAt === ev.queuedAt && q.account === ev.account)));
    setSelectedEvent(null);
    setAttendingNotes("");
    setLogs([]);
    toast.success("Evento finalizado e salvo!");
  }, []);

  // Agrupar por fila
  const grouped = useMemo(() => {
    const g = { attending: [] as QueueEvent[], observing: [] as QueueEvent[], tactical: [] as QueueEvent[], maintenance: [] as QueueEvent[], waiting: [] as QueueEvent[] };
    queues.forEach((q) => { if (g[q.queueStatus]) g[q.queueStatus].push(q); });
    return g;
  }, [queues]);

  function countSameClient(ev: QueueEvent) {
    return queues.filter(q => q.account === ev.account && q !== ev).length;
  }

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs((prev) => [`[${time}] ${msg}`, ...prev]);
  }

  function handleSelectEvent(ev: QueueEvent) {
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
    return (systemData || []).find((s: any) => s.account === selectedEvent.account);
  }, [selectedEvent, systemData]);

  const selectedClient = useMemo(() => {
    if (!selectedSystem) return null;
    return (clientData || []).find((c: any) => c.id === selectedSystem.clientId);
  }, [selectedSystem, clientData]);

  // Card do evento
  function EventCard({ ev }: { ev: QueueEvent }) {
    const sameClientCount = countSameClient(ev);
    const pri = PRIORITY_LABELS[ev.priority] || PRIORITY_LABELS.medium;
    const time = ev.receivedAt ? new Date(ev.receivedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";

    return (
      <div
        onClick={() => handleSelectEvent(ev)}
        className={`px-3 py-2.5 border-b border-border/30 cursor-pointer hover:bg-primary/10 transition-colors relative border-l-4 ${
          selectedEvent?.queuedAt === ev.queuedAt && selectedEvent?.account === ev.account ? 'bg-primary/15 border-l-primary' : (PRIORITY_BORDER[ev.priority] || PRIORITY_BORDER.medium)
        }`}
      >
        {sameClientCount > 0 && (
          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">{sameClientCount + 1}</span>
          </div>
        )}
        <div className="text-xs text-muted-foreground font-mono mb-0.5">{time}</div>
        <div className={`font-bold text-sm ${PRIORITY_TEXT_COLOR[ev.priority] || 'text-foreground'}`}>{ev.description || `Evento ${ev.eventCode}`}</div>
        <div className="text-xs text-primary font-medium">{ev.account} - {ev.clientName}</div>
        <div className="text-[11px] text-muted-foreground">Central: {ev.systemModel}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-mono text-xs text-muted-foreground">{ev.qualifier === 'E' ? '' : 'R'}{ev.eventCode}</span>
          <Badge className={`text-[10px] px-1.5 py-0 ${pri.color}`}>{pri.label}</Badge>
        </div>
        {sameClientCount > 0 && (
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
          events.map((ev, idx) => <EventCard key={`${ev.account}-${ev.queuedAt}-${idx}`} ev={ev} />)
        )}
      </div>
    );
  }

  return (
    <DashboardLayout>
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczHjqIrNjVpWQ+IjV8nczUr3hLMi5xi8DJtIRYPC0uf5y/xbOCVzYpZYqvuLmOaEkwMmqIqbK3lnFOMy9shqewtZd1UjUwbYamr7WYd1Q2MG6Gpq+1mHdUNjBuhqavtZh3VDYwboamr7WYd1Q2MG6Gpq+1mHdUNjBuhqavtZh3VDYwboamr7WYd1Q2AA==" type="audio/wav" />
      </audio>
      {expandedCam && <CameraModal cam={expandedCam} onClose={() => setExpandedCam(null)} />}

      <div className="flex flex-col h-full overflow-hidden">
        {/* TOP BAR - Botões de Status */}
        <div className="h-12 min-h-12 border-b border-border bg-card flex items-center justify-between px-4">
          <Button variant="outline" size="sm" className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10" onClick={() => toast.info("Ocorrência Manual")}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Ocorrência Manual
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="border-border text-foreground hover:bg-accent" onClick={() => toast.info("Lista de Desarmados")}>
              Desarmados
            </Button>
            <Button variant="outline" size="sm" className="border-border text-foreground hover:bg-accent" onClick={() => toast.info("Lista de Armados")}>
              Armados
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white font-bold">
              <Wifi className="h-3.5 w-3.5 mr-1" /> Online
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold">
              <WifiOff className="h-3.5 w-3.5 mr-1" /> Offline
            </Button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex flex-1 overflow-hidden">
          {/* COLUNA 1: Filas */}
          <div className="w-[300px] min-w-[300px] h-full border-r border-border bg-card flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                {connected ? (
                  <><div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /><span className="text-xs text-green-400 font-bold">ONLINE</span></>
                ) : (
                  <><div className="h-2 w-2 rounded-full bg-red-500" /><span className="text-xs text-red-400 font-bold">OFFLINE</span></>
                )}
              </div>
              <span className="text-xs text-muted-foreground">Operador: <strong className="text-foreground">{user?.name?.split(' ')[0]}</strong></span>
            </div>
            <ScrollArea className="flex-1">
              <QueueSection title="EM ATENDIMENTO" color="text-blue-400" events={grouped.attending} />
              <QueueSection title="EM OBSERVAÇÃO" color="text-purple-400" events={grouped.observing} />
              <QueueSection title="EM ATENDIMENTO TÁTICO" color="text-orange-400" events={grouped.tactical} />
              <QueueSection title="EM MANUTENÇÃO" color="text-yellow-400" events={grouped.maintenance} />
              <QueueSection title="AGUARDANDO" color="text-red-400" events={grouped.waiting} />
            </ScrollArea>
          </div>

          {/* COLUNA 2: Painel Central */}
          <div className="flex-1 h-full flex flex-col overflow-hidden">
            {!selectedEvent ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg">Selecione um evento na fila para atender</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* HEADER DO EVENTO */}
                <div className="px-4 py-3 border-b border-border bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className={`h-5 w-5 ${selectedEvent.qualifier === 'E' ? 'text-red-400' : 'text-green-400'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 font-bold">Conta {selectedEvent.account}</span>
                          <span className="text-foreground font-bold">{selectedClient?.name || selectedEvent.clientName}</span>
                          {selectedClient?.fantasyName && <span className="text-cyan-400">- {selectedClient.fantasyName}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`font-bold text-lg ${PRIORITY_TEXT_COLOR[selectedEvent.priority] || 'text-foreground'}`}>
                            {selectedEvent.qualifier}{selectedEvent.eventCode} - {selectedEvent.description}
                          </span>
                          <span className="text-muted-foreground">- Zona {selectedEvent.zoneUser}</span>
                          {selectedEvent.zoneName && <span className="text-foreground ml-1">{selectedEvent.zoneName}</span>}
                        </div>
                      </div>
                    </div>
                    <Timer startTime={attendStartTime} />
                  </div>
                </div>

                {/* OBSERVAÇÕES */}
                <div className="px-4 py-2 border-b border-border">
                  <div className="flex items-start gap-3">
                    <Textarea
                      className="flex-1 min-h-[60px] max-h-[80px] text-sm resize-none"
                      placeholder="Observações..."
                      value={attendingNotes}
                      onChange={(e) => setAttendingNotes(e.target.value)}
                    />
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-border" />
                        <Mail className="h-3 w-3" /> E-mail
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-border" />
                        <Send className="h-3 w-3" /> Push
                      </label>
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 mt-1" onClick={() => finalizeEvent(selectedEvent)}>
                        Finalizar
                      </Button>
                    </div>
                  </div>
                </div>

                {/* BARRA DE AÇÕES */}
                <div className="px-4 py-2 border-b border-border flex items-center gap-1 flex-wrap">
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setActiveTab("cameras"); toast.info("Providências"); }}>
                    <FileText className="h-3.5 w-3.5" /> Providências
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setActiveTab("cameras")}>
                    <Camera className="h-3.5 w-3.5" /> Câmeras
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-red-400" onClick={() => { addLog("Polícia acionada"); toast.info("Polícia acionada"); }}>
                    <Shield className="h-3.5 w-3.5" /> Polícia
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { moveEvent(selectedEvent, "observing"); addLog("Movido para Observação"); }}>
                    <Eye className="h-3.5 w-3.5" /> Observação
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-orange-400" onClick={() => { moveEvent(selectedEvent, "tactical"); addLog("Tático despachado"); }}>
                    <Truck className="h-3.5 w-3.5" /> Tático
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-yellow-400" onClick={() => { moveEvent(selectedEvent, "maintenance"); addLog("Movido para Manutenção"); }}>
                    <Wrench className="h-3.5 w-3.5" /> Manutenção
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-green-400" onClick={() => { addLog("Comando DESARMAR enviado"); toast.info("Comando desarmar enviado"); }}>
                    <Shield className="h-3.5 w-3.5" /> Desarmar
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-cyan-400" onClick={() => { addLog(`Zona ${selectedEvent.zoneUser} isolada`); toast.info("Zona isolada"); }}>
                    <Ban className="h-3.5 w-3.5" /> Isolar Zona
                  </Button>
                </div>

                {/* CÂMERAS / CONTEÚDO */}
                <div className="flex-1 px-4 py-3 overflow-hidden flex flex-col justify-center">
                  {/* Carrossel de Câmeras - setas para navegar, clique para expandir */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCamPage(Math.max(0, camPage - 1))}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={camPage === 0}
                    >
                      <ChevronLeft className="h-7 w-7" />
                    </button>
                    <div className="flex-1 grid grid-cols-4 gap-3">
                      {Array.from({ length: camsPerPage }, (_, i) => {
                        const camNum = camPage * camsPerPage + i + 1;
                        return (
                          <div
                            key={camNum}
                            onClick={() => setExpandedCam(camNum)}
                            className="border border-border rounded-lg flex flex-col items-center justify-center bg-black/50 cursor-pointer hover:border-primary/50 hover:bg-black/70 transition-colors relative group aspect-square max-h-[160px]"
                          >
                            <Camera className="h-8 w-8 text-muted-foreground mb-1" />
                            <span className="text-muted-foreground text-sm font-medium">Câmera {camNum}</span>
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
                      <ChevronRight className="h-7 w-7" />
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
                      {selectedClient?.phone ? (
                        <div className="flex items-center justify-between bg-secondary/30 rounded px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-mono">{selectedClient.phone}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-xs"><PhoneCall className="h-3 w-3 mr-1" />Ligar</Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Nenhum contato cadastrado</p>
                      )}
                      {selectedClient?.whatsapp && (
                        <div className="flex items-center justify-between bg-secondary/30 rounded px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-green-400" />
                            <span className="text-sm font-mono text-green-400">{selectedClient.whatsapp}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-xs text-green-400">WhatsApp</Button>
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === "zones" && (
                    <div className="mt-2 space-y-1 max-h-[100px] overflow-auto">
                      <div className="flex items-center gap-2 bg-secondary/30 rounded px-3 py-1.5">
                        <span className="text-xs font-mono text-red-400 font-bold">Zona {selectedEvent.zoneUser}</span>
                        <span className="text-xs text-muted-foreground">- Setor em disparo</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* COLUNA 3: Logs da Ocorrência */}
          <div className="w-[200px] min-w-[200px] h-full border-l border-border bg-card flex flex-col">
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
    </DashboardLayout>
  );
}
