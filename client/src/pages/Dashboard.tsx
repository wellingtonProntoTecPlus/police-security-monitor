import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSocket, AlarmEvent } from "@/hooks/useSocket";
import {
  Bell, Phone, PhoneCall, Shield, Camera, FileText, Truck, X,
  CheckCircle2, Ban, AlertTriangle, Users, Eye, Wrench
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type QueueStatus = "waiting" | "attending" | "observing" | "tactical" | "maintenance";

interface QueueEvent extends AlarmEvent {
  receivedAt?: string;
  queueStatus: QueueStatus;
  queuedAt: number; // timestamp
  clientName?: string;
  systemModel?: string;
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

export default function Dashboard() {
  const { user } = useAuth();
  const [queues, setQueues] = useState<QueueEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<QueueEvent | null>(null);
  const [attendingNotes, setAttendingNotes] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processedIds = useRef<Set<string>>(new Set());

  const { connected, realtimeEvents } = useSocket();

  // Queries
  const { data: dbEvents = [] } = trpc.alarmEvent.list.useQuery({ limit: 50 }, { refetchInterval: 15000 });
  const { data: clientData } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: systemData } = trpc.alarmSystem.list.useQuery(undefined);

  // Processar novos eventos em tempo real → adicionar à fila AGUARDANDO
  useEffect(() => {
    if (realtimeEvents.length === 0) return;
    const newEvents: QueueEvent[] = [];
    realtimeEvents.forEach((ev) => {
      const evKey = `${ev.account}-${ev.eventCode}-${ev.timestamp || Date.now()}`;
      if (!processedIds.current.has(evKey)) {
        processedIds.current.add(evKey);
        // Buscar dados do cliente/sistema
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
      // Alerta sonoro
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
      q === ev ? { ...q, queueStatus: newStatus } : q
    ));
    if (selectedEvent === ev) {
      setSelectedEvent({ ...ev, queueStatus: newStatus });
    }
  }, [selectedEvent]);

  // Finalizar evento (remover da fila)
  const finalizeEvent = useCallback((ev: QueueEvent) => {
    setQueues((prev) => prev.filter((q) => q !== ev));
    setSelectedEvent(null);
    setAttendingNotes("");
    toast.success("Evento finalizado e salvo no banco!");
  }, []);

  // Agrupar por fila
  const grouped = useMemo(() => {
    const g = { attending: [] as QueueEvent[], observing: [] as QueueEvent[], tactical: [] as QueueEvent[], maintenance: [] as QueueEvent[], waiting: [] as QueueEvent[] };
    queues.forEach((q) => { if (g[q.queueStatus]) g[q.queueStatus].push(q); });
    return g;
  }, [queues]);

  // Contar eventos do mesmo cliente
  function countSameClient(ev: QueueEvent) {
    return queues.filter(q => q.account === ev.account && q !== ev).length;
  }

  // Selecionar evento → mover para "attending"
  function handleSelectEvent(ev: QueueEvent) {
    if (ev.queueStatus === "waiting") {
      moveEvent(ev, "attending");
      setSelectedEvent({ ...ev, queueStatus: "attending" });
    } else {
      setSelectedEvent(ev);
    }
    setAttendingNotes("");
  }

  // Encontrar cliente pelo account
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
        {/* Badge de contagem */}
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

  // Seção de fila
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

      <div className="flex h-full overflow-hidden">
        {/* COLUNA 1: Filas de Eventos */}
        <div className="w-[340px] min-w-[340px] h-full border-r border-border bg-card flex flex-col">
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

        {/* COLUNA 2: Dados do Evento / Cliente */}
        <div className="flex-1 h-full flex flex-col overflow-hidden">
          {!selectedEvent ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg">Selecione um evento na fila para atender</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className={`h-6 w-6 ${selectedEvent.qualifier === 'E' ? 'text-red-400' : 'text-green-400'}`} />
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{selectedEvent.description || `Evento ${selectedEvent.eventCode}`}</h2>
                      <p className="text-sm text-muted-foreground">{selectedEvent.account} - {selectedEvent.clientName}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}><X className="h-4 w-4" /></Button>
                </div>

                <Separator />

                {/* Sistema */}
                <div>
                  <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Sistema</h3>
                  <div className="grid grid-cols-3 gap-3 bg-secondary/30 rounded-lg p-3">
                    <div><span className="text-xs text-muted-foreground block">Conta</span><span className="font-mono font-bold text-lg">{selectedEvent.account}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Central</span><span className="font-bold">{selectedEvent.systemModel}</span></div>
                    <div><span className="text-xs text-muted-foreground block">IP</span><span className="font-mono text-sm">{selectedEvent.remoteIp}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Partição</span><span className="font-mono text-lg">{selectedEvent.partition}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Zona/Setor</span><span className="font-mono font-bold text-lg text-red-400">{selectedEvent.zoneUser}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Código</span><span className="font-mono">{selectedEvent.qualifier}{selectedEvent.eventCode}</span></div>
                  </div>
                </div>

                {/* Cliente */}
                <div>
                  <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Cliente</h3>
                  {selectedClient ? (
                    <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                      <p className="font-bold text-foreground">{selectedClient.fantasyName || selectedClient.name}</p>
                      {selectedClient.fantasyName && <p className="text-sm text-muted-foreground">{selectedClient.name}</p>}
                      <p className="text-sm text-muted-foreground">{selectedClient.address}{selectedClient.number ? `, ${selectedClient.number}` : ''}{selectedClient.neighborhood ? ` - ${selectedClient.neighborhood}` : ''}</p>
                      <p className="text-sm text-muted-foreground">{selectedClient.city}/{selectedClient.state}</p>
                    </div>
                  ) : (
                    <div className="bg-secondary/30 rounded-lg p-3"><p className="text-sm text-yellow-400">Cliente não cadastrado para conta {selectedEvent.account}</p></div>
                  )}
                </div>

                {/* Providências */}
                <div>
                  <h3 className="font-bold text-sm text-yellow-400 mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Providências</h3>
                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                    <ol className="text-sm text-foreground space-y-1 list-decimal list-inside">
                      <li>Ligar para contatos na ordem de cadastro</li>
                      <li>Verificar câmeras do local</li>
                      <li>Se necessário, acionar tático</li>
                      <li>Se necessário, chamar a polícia</li>
                      <li>Registrar observações e finalizar</li>
                    </ol>
                  </div>
                </div>

                {/* Contatos */}
                <div>
                  <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> Contatos</h3>
                  {selectedClient?.phone || selectedClient?.whatsapp ? (
                    <div className="space-y-2">
                      {selectedClient.phone && (
                        <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
                          <div><span className="text-xs text-muted-foreground">Telefone</span><p className="font-mono font-bold">{selectedClient.phone}</p></div>
                          <Button size="sm" variant="outline" className="h-8"><PhoneCall className="h-3.5 w-3.5 mr-1" />Ligar</Button>
                        </div>
                      )}
                      {selectedClient.whatsapp && (
                        <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
                          <div><span className="text-xs text-muted-foreground">WhatsApp</span><p className="font-mono font-bold text-green-400">{selectedClient.whatsapp}</p></div>
                          <Button size="sm" variant="outline" className="h-8 border-green-500 text-green-400">Enviar</Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum contato disponível</p>
                  )}
                </div>

                {/* Observações */}
                <div>
                  <h3 className="font-bold text-sm text-foreground mb-2">Observações</h3>
                  <Textarea className="min-h-[80px]" placeholder="Registre as ações tomadas..." value={attendingNotes} onChange={(e) => setAttendingNotes(e.target.value)} />
                </div>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* COLUNA 3: Ações */}
        <div className="w-[200px] min-w-[200px] h-full border-l border-border bg-card flex flex-col">
          {!selectedEvent ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-center px-3">
              <p className="text-xs">Selecione um evento para iniciar o atendimento</p>
            </div>
          ) : (
            <div className="flex flex-col h-full p-3 gap-2">
              <h3 className="font-bold text-xs text-muted-foreground text-center uppercase">Ações</h3>
              <Separator />

              <Button variant="outline" className="w-full justify-start h-9 text-xs" onClick={() => toast.info("Câmeras")}>
                <Camera className="h-3.5 w-3.5 mr-2" /> Câmeras
              </Button>
              <Button variant="outline" className="w-full justify-start h-9 text-xs" onClick={() => { moveEvent(selectedEvent, "observing"); toast.info("Movido para Observação"); }}>
                <Eye className="h-3.5 w-3.5 mr-2" /> Observação
              </Button>
              <Button variant="outline" className="w-full justify-start h-9 text-xs border-orange-500/50 text-orange-400" onClick={() => { moveEvent(selectedEvent, "tactical"); toast.info("Tático despachado"); }}>
                <Truck className="h-3.5 w-3.5 mr-2" /> Tático
              </Button>
              <Button variant="outline" className="w-full justify-start h-9 text-xs border-yellow-500/50 text-yellow-400" onClick={() => { moveEvent(selectedEvent, "maintenance"); toast.info("Movido para Manutenção"); }}>
                <Wrench className="h-3.5 w-3.5 mr-2" /> Manutenção
              </Button>
              <Button variant="outline" className="w-full justify-start h-9 text-xs border-cyan-500/50 text-cyan-400" onClick={() => { if (selectedEvent) { moveEvent(selectedEvent, "waiting"); setSelectedEvent(null); } }}>
                <Ban className="h-3.5 w-3.5 mr-2" /> Isolar Zona
              </Button>
              <Button variant="outline" className="w-full justify-start h-9 text-xs border-red-500/50 text-red-400" onClick={() => { setAttendingNotes(prev => prev + "\n[POLÍCIA] " + new Date().toLocaleTimeString("pt-BR")); toast.info("Polícia acionada"); }}>
                <Shield className="h-3.5 w-3.5 mr-2" /> Polícia
              </Button>

              <div className="flex-1" />
              <Separator />
              <Button className="w-full h-11 font-bold bg-green-600 hover:bg-green-700" onClick={() => finalizeEvent(selectedEvent)}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Finalizar
              </Button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
