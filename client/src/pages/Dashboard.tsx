import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useSocket, AlarmEvent } from "@/hooks/useSocket";
import {
  Bell, Phone, PhoneCall, Shield, Camera, FileText, Truck, X,
  CheckCircle2, Ban, AlertTriangle, Users, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface SelectedEvent extends AlarmEvent {
  dbId?: number;
  receivedAt?: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  const [attendingNotes, setAttendingNotes] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevEventCount = useRef(0);

  const { connected, realtimeEvents } = useSocket();

  // Alerta sonoro
  useEffect(() => {
    if (realtimeEvents.length > prevEventCount.current && prevEventCount.current > 0) {
      const newEvent = realtimeEvents[0];
      if (newEvent && (newEvent.priority === "critical" || newEvent.priority === "high")) {
        try { audioRef.current?.play(); } catch {}
      }
    }
    prevEventCount.current = realtimeEvents.length;
  }, [realtimeEvents.length]);

  // Queries
  const { data: dbEvents = [] } = trpc.alarmEvent.list.useQuery({ limit: 50 }, { refetchInterval: 10000 });
  const { data: incidents = [] } = trpc.incident.list.useQuery(undefined, { refetchInterval: 5000 });
  const { data: clientData } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: systemData } = trpc.alarmSystem.list.useQuery(undefined);

  // Combinar eventos
  const allEvents = useMemo(() => {
    const rtIds = new Set(realtimeEvents.filter(e => e.id).map(e => e.id));
    const dbFiltered = dbEvents.filter((e: any) => !rtIds.has(e.id));
    return [...realtimeEvents, ...dbFiltered].slice(0, 100);
  }, [realtimeEvents, dbEvents]);

  // Categorizar por status (simulação baseada em prioridade)
  const categorized = useMemo(() => {
    const attending: any[] = [];
    const observing: any[] = [];
    const tactical: any[] = [];
    const maintenance: any[] = [];
    const waiting: any[] = [];

    // Eventos não tratados vão para aguardando
    allEvents.forEach(ev => {
      waiting.push(ev);
    });

    return { attending, observing, tactical, maintenance, waiting };
  }, [allEvents, incidents]);

  // Encontrar cliente pelo account
  const selectedSystem = useMemo(() => {
    if (!selectedEvent) return null;
    return (systemData || []).find((s: any) => s.account === selectedEvent.account);
  }, [selectedEvent, systemData]);

  const selectedClient = useMemo(() => {
    if (!selectedSystem) return null;
    return (clientData || []).find((c: any) => c.id === selectedSystem.clientId);
  }, [selectedSystem, clientData]);

  function handleAtender(ev: SelectedEvent) {
    setSelectedEvent(ev);
    setAttendingNotes("");
  }

  function handleDespacharTatico() {
    toast.success("Tático despachado!");
    setAttendingNotes((prev) => prev + "\n[TÁTICO DESPACHADO] " + new Date().toLocaleTimeString("pt-BR"));
  }

  function handleChamarPolicia() {
    toast.success("Polícia acionada!");
    setAttendingNotes((prev) => prev + "\n[POLÍCIA ACIONADA] " + new Date().toLocaleTimeString("pt-BR"));
  }

  function handleIsolarZona() {
    toast.success(`Zona ${selectedEvent?.zoneUser} isolada`);
    setAttendingNotes((prev) => prev + `\n[ZONA ${selectedEvent?.zoneUser} ISOLADA] ` + new Date().toLocaleTimeString("pt-BR"));
  }

  function handleFinalizar() {
    toast.success("Evento finalizado!");
    setSelectedEvent(null);
    setAttendingNotes("");
  }

  // Componente de fila
  function QueueSection({ title, color, events }: { title: string; color: string; events: any[] }) {
    return (
      <div className="mb-1">
        <div className={`px-3 py-1.5 font-bold text-sm ${color} border-b border-border/30`}>
          {title} ({events.length})
        </div>
        {events.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground italic">Nenhuma ocorrência</div>
        ) : (
          events.slice(0, 10).map((ev: any, idx: number) => (
            <div
              key={ev.id || `ev-${idx}`}
              onClick={() => handleAtender(ev)}
              className={`px-3 py-1.5 border-b border-border/20 cursor-pointer hover:bg-primary/10 transition-colors text-xs ${
                selectedEvent?.id === ev.id ? 'bg-primary/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-foreground">{ev.account}</span>
                <Badge variant="outline" className={`text-[10px] px-1 py-0 ${ev.qualifier === 'E' ? 'border-red-500 text-red-400' : 'border-green-500 text-green-400'}`}>
                  {ev.qualifier}{ev.eventCode}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {ev.description || `Evento ${ev.eventCode}`} - Zona {ev.zoneUser}
              </div>
            </div>
          ))
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
        <div className="w-[320px] min-w-[320px] h-full border-r border-border bg-card flex flex-col">
          {/* Header com status */}
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              {connected ? (
                <><div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /><span className="text-xs text-green-400 font-bold">ONLINE</span></>
              ) : (
                <><div className="h-2 w-2 rounded-full bg-red-500" /><span className="text-xs text-red-400 font-bold">OFFLINE</span></>
              )}
            </div>
            <span className="text-xs text-muted-foreground">Operador: <strong className="text-foreground">{user?.name}</strong></span>
          </div>

          {/* Filas */}
          <ScrollArea className="flex-1">
            <QueueSection title="EM ATENDIMENTO" color="text-blue-400" events={categorized.attending} />
            <QueueSection title="EM OBSERVAÇÃO" color="text-purple-400" events={categorized.observing} />
            <QueueSection title="EM ATENDIMENTO TÁTICO" color="text-orange-400" events={categorized.tactical} />
            <QueueSection title="EM MANUTENÇÃO" color="text-yellow-400" events={categorized.maintenance} />
            <QueueSection title="AGUARDANDO" color="text-red-400" events={categorized.waiting} />
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
                {/* Header do Evento */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className={`h-6 w-6 ${selectedEvent.qualifier === 'E' ? 'text-red-400' : 'text-green-400'}`} />
                    <div>
                      <h2 className="text-lg font-bold text-foreground">
                        {selectedEvent.qualifier === 'E' ? 'EVENTO' : 'RESTAURO'} {selectedEvent.eventCode}
                      </h2>
                      <p className="text-sm text-muted-foreground">{selectedEvent.description}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <Separator />

                {/* Dados do Sistema */}
                <div>
                  <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> Dados do Sistema
                  </h3>
                  <div className="grid grid-cols-3 gap-3 bg-secondary/30 rounded-lg p-3">
                    <div><span className="text-xs text-muted-foreground block">Conta</span><span className="font-mono font-bold text-lg">{selectedEvent.account}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Marca</span><span className="font-bold">{selectedEvent.brand}</span></div>
                    <div><span className="text-xs text-muted-foreground block">IP</span><span className="font-mono text-sm">{selectedEvent.remoteIp}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Partição</span><span className="font-mono text-lg">{selectedEvent.partition}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Zona/Setor</span><span className="font-mono font-bold text-lg text-red-400">{selectedEvent.zoneUser}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Hora</span><span className="font-mono">{selectedEvent.receivedAt ? new Date(selectedEvent.receivedAt).toLocaleTimeString("pt-BR") : new Date().toLocaleTimeString("pt-BR")}</span></div>
                  </div>
                </div>

                {/* Dados do Cliente */}
                <div>
                  <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Cliente
                  </h3>
                  {selectedClient ? (
                    <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                      <p className="font-bold text-foreground">{selectedClient.fantasyName || selectedClient.name}</p>
                      {selectedClient.fantasyName && <p className="text-sm text-muted-foreground">{selectedClient.name}</p>}
                      <p className="text-sm text-muted-foreground">
                        {selectedClient.address}{selectedClient.number ? `, ${selectedClient.number}` : ''}{selectedClient.neighborhood ? ` - ${selectedClient.neighborhood}` : ''}
                      </p>
                      <p className="text-sm text-muted-foreground">{selectedClient.city}/{selectedClient.state}</p>
                    </div>
                  ) : (
                    <div className="bg-secondary/30 rounded-lg p-3">
                      <p className="text-sm text-yellow-400">Conta {selectedEvent.account} - Cliente não cadastrado</p>
                    </div>
                  )}
                </div>

                {/* Providências */}
                <div>
                  <h3 className="font-bold text-sm text-yellow-400 mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Providências
                  </h3>
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
                  <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary" /> Contatos
                  </h3>
                  {selectedClient ? (
                    <div className="space-y-2">
                      {selectedClient.phone && (
                        <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-xs text-muted-foreground">Telefone Principal</span>
                            <p className="font-mono font-bold text-foreground">{selectedClient.phone}</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-8"><PhoneCall className="h-3.5 w-3.5 mr-1" />Ligar</Button>
                        </div>
                      )}
                      {selectedClient.whatsapp && (
                        <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-xs text-muted-foreground">WhatsApp</span>
                            <p className="font-mono font-bold text-green-400">{selectedClient.whatsapp}</p>
                          </div>
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
                  <h3 className="font-bold text-sm text-foreground mb-2">Observações do Operador</h3>
                  <Textarea
                    className="min-h-[100px]"
                    placeholder="Registre as ações tomadas durante o atendimento..."
                    value={attendingNotes}
                    onChange={(e) => setAttendingNotes(e.target.value)}
                  />
                </div>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* COLUNA 3: Ações do Operador */}
        <div className="w-[220px] min-w-[220px] h-full border-l border-border bg-card flex flex-col">
          {!selectedEvent ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-center px-4">
              <p className="text-sm">Selecione um evento para iniciar o atendimento</p>
            </div>
          ) : (
            <div className="flex flex-col h-full p-3 gap-3">
              <h3 className="font-bold text-sm text-foreground text-center">AÇÕES</h3>
              <Separator />

              <Button variant="outline" className="w-full justify-start h-10 text-sm border-blue-500/50 text-blue-400 hover:bg-blue-500/10" onClick={() => toast.info("Câmeras do cliente")}>
                <Camera className="h-4 w-4 mr-2" /> Ver Câmeras
              </Button>

              <Button variant="outline" className="w-full justify-start h-10 text-sm border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10" onClick={handleIsolarZona}>
                <Ban className="h-4 w-4 mr-2" /> Isolar Zona
              </Button>

              <Button variant="outline" className="w-full justify-start h-10 text-sm border-purple-500/50 text-purple-400 hover:bg-purple-500/10" onClick={() => toast.info("Em observação")}>
                <Eye className="h-4 w-4 mr-2" /> Observação
              </Button>

              <Button variant="outline" className="w-full justify-start h-10 text-sm border-orange-500/50 text-orange-400 hover:bg-orange-500/10" onClick={handleDespacharTatico}>
                <Truck className="h-4 w-4 mr-2" /> Despachar Tático
              </Button>

              <Button variant="outline" className="w-full justify-start h-10 text-sm border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={handleChamarPolicia}>
                <Shield className="h-4 w-4 mr-2" /> Chamar Polícia
              </Button>

              <div className="flex-1" />

              <Separator />

              <Button className="w-full h-12 font-bold bg-green-600 hover:bg-green-700 text-white" onClick={handleFinalizar}>
                <CheckCircle2 className="h-5 w-5 mr-2" /> Finalizar
              </Button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
