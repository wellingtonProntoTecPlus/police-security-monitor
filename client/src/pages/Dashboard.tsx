import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useSocket, AlarmEvent } from "@/hooks/useSocket";
import {
  Bell, Radio, Clock, Users, AlertTriangle, Wifi, WifiOff,
  Phone, PhoneCall, Shield, Camera, FileText, Truck, X,
  CheckCircle2, Eye, Ban, Volume2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface SelectedEvent extends AlarmEvent {
  dbId?: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  const [attendingNotes, setAttendingNotes] = useState("");
  const [filterBrand, setFilterBrand] = useState("all");
  const [searchAccount, setSearchAccount] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevEventCount = useRef(0);

  // Socket.IO para eventos em tempo real
  const { connected, realtimeEvents } = useSocket();

  // Atualizar relógio
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Alerta sonoro para novos eventos
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
  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { refetchInterval: 10000 });
  const { data: dbEvents = [] } = trpc.alarmEvent.list.useQuery({ limit: 50 }, { refetchInterval: 15000 });
  const { data: incidents = [] } = trpc.incident.list.useQuery(undefined, { refetchInterval: 5000 });

  // Buscar dados do cliente quando um evento é selecionado
  const { data: clientData } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: systemData } = trpc.alarmSystem.list.useQuery(undefined);

  // Combinar eventos
  const allEvents = useMemo(() => {
    const rtIds = new Set(realtimeEvents.filter(e => e.id).map(e => e.id));
    const dbFiltered = dbEvents.filter((e: any) => !rtIds.has(e.id));
    return [...realtimeEvents, ...dbFiltered].slice(0, 100);
  }, [realtimeEvents, dbEvents]);

  // Filtrar eventos
  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev: any) => {
      if (searchAccount && !ev.account?.includes(searchAccount)) return false;
      if (filterBrand !== "all" && ev.brand !== filterBrand) return false;
      return true;
    });
  }, [allEvents, searchAccount, filterBrand]);

  // Contadores por status
  const incidentCounts = useMemo(() => {
    const counts = { waiting: 0, attending: 0, observing: 0, dispatched: 0 };
    incidents.forEach((inc: any) => {
      if (inc.status in counts) counts[inc.status as keyof typeof counts]++;
    });
    return counts;
  }, [incidents]);

  // Encontrar cliente pelo account do evento selecionado
  const selectedSystem = useMemo(() => {
    if (!selectedEvent) return null;
    return (systemData || []).find((s: any) => s.account === selectedEvent.account);
  }, [selectedEvent, systemData]);

  const selectedClient = useMemo(() => {
    if (!selectedSystem) return null;
    return (clientData || []).find((c: any) => c.id === selectedSystem.clientId);
  }, [selectedSystem, clientData]);

  const hora = currentTime.toLocaleTimeString("pt-BR");
  const data = currentTime.toLocaleDateString("pt-BR");

  function handleAtender(ev: SelectedEvent) {
    setSelectedEvent(ev);
    setAttendingNotes("");
    toast.info(`Atendendo evento ${ev.qualifier}${ev.eventCode} - Conta ${ev.account}`);
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
    toast.success(`Zona ${selectedEvent?.zoneUser} isolada temporariamente`);
    setAttendingNotes((prev) => prev + `\n[ZONA ${selectedEvent?.zoneUser} ISOLADA] ` + new Date().toLocaleTimeString("pt-BR"));
  }

  function handleFinalizar() {
    toast.success("Evento finalizado!");
    setSelectedEvent(null);
    setAttendingNotes("");
  }

  return (
    <DashboardLayout>
      {/* Audio para alertas */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczHjqIrNjVpWQ+IjV8nczUr3hLMi5xi8DJtIRYPC0uf5y/xbOCVzYpZYqvuLmOaEkwMmqIqbK3lnFOMy9shqewtZd1UjUwbYamr7WYd1Q2MG6Gpq+1mHdUNjBuhqavtZh3VDYwboamr7WYd1Q2MG6Gpq+1mHdUNjBuhqavtZh3VDYwboamr7WYd1Q2AA==" type="audio/wav" />
      </audio>

      <div className="flex h-full">
        {/* COLUNA ESQUERDA: Fila de Eventos */}
        <div className={`flex flex-col ${selectedEvent ? 'w-[55%]' : 'w-full'} h-full border-r border-border transition-all`}>
          {/* HEADER */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
            <div className="flex items-center gap-3">
              {connected ? (
                <><div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" /><span className="text-green-400 font-bold text-sm">OPERACIONAL</span><Wifi className="h-3.5 w-3.5 text-green-400" /></>
              ) : (
                <><div className="h-2.5 w-2.5 rounded-full bg-red-500" /><span className="text-red-400 font-bold text-sm">RECONECTANDO</span><WifiOff className="h-3.5 w-3.5 text-red-400" /></>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold font-mono text-foreground">{hora}</span>
              <span className="text-sm text-muted-foreground">{data}</span>
              <span className="text-sm font-medium text-foreground">{user?.name}</span>
            </div>
          </div>

          {/* FILAS DE STATUS */}
          <div className="grid grid-cols-4 gap-2 px-4 py-2">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1 text-center">
              <p className="text-[10px] text-yellow-400 font-bold">AGUARDANDO</p>
              <p className="text-lg font-bold text-yellow-300">{incidentCounts.waiting}</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded px-2 py-1 text-center">
              <p className="text-[10px] text-blue-400 font-bold">ATENDIMENTO</p>
              <p className="text-lg font-bold text-blue-300">{incidentCounts.attending}</p>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/30 rounded px-2 py-1 text-center">
              <p className="text-[10px] text-purple-400 font-bold">OBSERVAÇÃO</p>
              <p className="text-lg font-bold text-purple-300">{incidentCounts.observing}</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded px-2 py-1 text-center">
              <p className="text-[10px] text-orange-400 font-bold">TÁTICO</p>
              <p className="text-lg font-bold text-orange-300">{incidentCounts.dispatched}</p>
            </div>
          </div>

          {/* FILTROS */}
          <div className="flex items-center gap-2 px-4 py-1">
            <Input placeholder="Conta..." className="h-8 w-28 text-xs bg-card" value={searchAccount} onChange={(e) => setSearchAccount(e.target.value)} />
            <Select value={filterBrand} onValueChange={setFilterBrand}>
              <SelectTrigger className="h-8 w-28 text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="JFL">JFL</SelectItem>
                <SelectItem value="INTELBRAS">Intelbras</SelectItem>
                <SelectItem value="VETTI">Vetti</SelectItem>
                <SelectItem value="COMPATEC">Compatec</SelectItem>
                <SelectItem value="RADIOENGE">Radioenge</SelectItem>
                <SelectItem value="VIAWEB">ViaWeb</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">{filteredEvents.length} eventos</Badge>
          </div>

          {/* GRID DE EVENTOS */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="grid grid-cols-[70px_60px_80px_50px_1fr_40px_50px] gap-1 px-4 py-1 bg-secondary/50 text-[10px] font-bold text-muted-foreground uppercase border-b border-border">
              <span>Hora</span><span>Conta</span><span>Marca</span><span>Cód</span><span>Descrição</span><span>Pt</span><span>Zona</span>
            </div>
            <ScrollArea className="h-[calc(100vh-240px)]">
              {filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
                  <Bell className="h-5 w-5 opacity-50" />
                  <span className="text-sm">Aguardando eventos...</span>
                </div>
              ) : (
                filteredEvents.map((ev: any, idx: number) => (
                  <div
                    key={ev.id || `rt-${idx}`}
                    onClick={() => handleAtender(ev)}
                    className={`grid grid-cols-[70px_60px_80px_50px_1fr_40px_50px] gap-1 px-4 py-1.5 border-b border-border/30 hover:bg-primary/10 cursor-pointer transition-colors items-center text-xs ${
                      selectedEvent?.id === ev.id ? 'bg-primary/20 border-l-4 border-l-primary' :
                      ev.priority === 'critical' ? 'border-l-4 border-l-red-500 bg-red-500/5' :
                      ev.priority === 'high' ? 'border-l-4 border-l-orange-500' :
                      'border-l-4 border-l-transparent'
                    }`}
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {ev.receivedAt ? new Date(ev.receivedAt).toLocaleTimeString("pt-BR") : ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString("pt-BR") : "--:--"}
                    </span>
                    <span className="font-mono font-bold text-foreground">{ev.account}</span>
                    <span className="text-[11px] text-foreground">{ev.brand}</span>
                    <Badge variant="outline" className={`text-[10px] px-1 py-0 ${ev.qualifier === 'E' ? 'border-red-500 text-red-400' : 'border-green-500 text-green-400'}`}>
                      {ev.qualifier}{ev.eventCode}
                    </Badge>
                    <span className="text-foreground truncate text-[11px]">{ev.description || `Evento ${ev.eventCode}`}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{ev.partition}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{ev.zoneUser}</span>
                  </div>
                ))
              )}
            </ScrollArea>
          </div>
        </div>

        {/* COLUNA DIREITA: Painel de Atendimento */}
        {selectedEvent && (
          <div className="w-[45%] h-full flex flex-col bg-card border-l border-border overflow-hidden">
            {/* Header do atendimento */}
            <div className="flex items-center justify-between px-4 py-2 bg-red-500/10 border-b border-red-500/30">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div>
                  <span className="font-bold text-foreground text-sm">
                    {selectedEvent.qualifier === 'E' ? 'EVENTO' : 'RESTAURO'} {selectedEvent.eventCode}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">{selectedEvent.description}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Dados do Cliente */}
                <Card className="border-primary/30">
                  <CardContent className="p-3">
                    <h4 className="font-bold text-sm text-foreground mb-2 flex items-center gap-1">
                      <Users className="h-4 w-4 text-primary" /> Cliente
                    </h4>
                    {selectedClient ? (
                      <div className="space-y-1 text-xs">
                        <p className="font-bold text-foreground text-sm">{selectedClient.fantasyName || selectedClient.name}</p>
                        {selectedClient.fantasyName && <p className="text-muted-foreground">{selectedClient.name}</p>}
                        <p className="text-muted-foreground">{selectedClient.address}{selectedClient.number ? `, ${selectedClient.number}` : ''} - {selectedClient.neighborhood}</p>
                        <p className="text-muted-foreground">{selectedClient.city}/{selectedClient.state}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Conta {selectedEvent.account} - Cliente não identificado</p>
                    )}
                  </CardContent>
                </Card>

                {/* Informações do Evento */}
                <Card>
                  <CardContent className="p-3">
                    <h4 className="font-bold text-sm text-foreground mb-2 flex items-center gap-1">
                      <Shield className="h-4 w-4 text-primary" /> Sistema
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Conta:</span> <span className="font-mono font-bold">{selectedEvent.account}</span></div>
                      <div><span className="text-muted-foreground">Marca:</span> <span className="font-bold">{selectedEvent.brand}</span></div>
                      <div><span className="text-muted-foreground">Partição:</span> <span className="font-mono">{selectedEvent.partition}</span></div>
                      <div><span className="text-muted-foreground">Zona:</span> <span className="font-mono font-bold text-red-400">{selectedEvent.zoneUser}</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">IP:</span> <span className="font-mono">{selectedEvent.remoteIp}</span></div>
                    </div>
                  </CardContent>
                </Card>

                {/* Providências */}
                <Card className="border-yellow-500/30">
                  <CardContent className="p-3">
                    <h4 className="font-bold text-sm text-yellow-400 mb-2 flex items-center gap-1">
                      <FileText className="h-4 w-4" /> Providências
                    </h4>
                    <ol className="text-xs text-foreground space-y-1 list-decimal list-inside">
                      <li>Ligar para contatos na ordem de cadastro</li>
                      <li>Verificar câmeras do local</li>
                      <li>Se necessário, acionar tático</li>
                      <li>Se necessário, chamar a polícia</li>
                      <li>Registrar observações e finalizar</li>
                    </ol>
                  </CardContent>
                </Card>

                {/* Contatos */}
                <Card>
                  <CardContent className="p-3">
                    <h4 className="font-bold text-sm text-foreground mb-2 flex items-center gap-1">
                      <Phone className="h-4 w-4 text-primary" /> Contatos
                    </h4>
                    {selectedClient ? (
                      <div className="space-y-2">
                        {selectedClient.phone && (
                          <div className="flex items-center justify-between bg-secondary/50 rounded px-2 py-1">
                            <div className="text-xs">
                              <span className="font-bold">Principal</span>
                              <span className="ml-2 font-mono">{selectedClient.phone}</span>
                            </div>
                            <Button size="sm" variant="outline" className="h-6 text-xs"><PhoneCall className="h-3 w-3 mr-1" />Ligar</Button>
                          </div>
                        )}
                        {selectedClient.whatsapp && (
                          <div className="flex items-center justify-between bg-secondary/50 rounded px-2 py-1">
                            <div className="text-xs">
                              <span className="font-bold text-green-400">WhatsApp</span>
                              <span className="ml-2 font-mono">{selectedClient.whatsapp}</span>
                            </div>
                            <Button size="sm" variant="outline" className="h-6 text-xs border-green-500 text-green-400">Enviar</Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum contato disponível</p>
                    )}
                  </CardContent>
                </Card>

                {/* Observações do Operador */}
                <Card>
                  <CardContent className="p-3">
                    <h4 className="font-bold text-sm text-foreground mb-2">Observações</h4>
                    <Textarea
                      className="text-xs min-h-[80px]"
                      placeholder="Registre as ações tomadas..."
                      value={attendingNotes}
                      onChange={(e) => setAttendingNotes(e.target.value)}
                    />
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>

            {/* Barra de Ações */}
            <div className="border-t border-border p-3 bg-card space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <Button size="sm" variant="outline" className="text-xs h-9" onClick={handleIsolarZona}>
                  <Ban className="h-3.5 w-3.5 mr-1" /> Isolar Zona
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-9 border-blue-500 text-blue-400" onClick={() => toast.info("Câmeras do cliente")}>
                  <Camera className="h-3.5 w-3.5 mr-1" /> Câmeras
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-9 border-orange-500 text-orange-400" onClick={handleDespacharTatico}>
                  <Truck className="h-3.5 w-3.5 mr-1" /> Tático
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-9 border-red-500 text-red-400" onClick={handleChamarPolicia}>
                  <Shield className="h-3.5 w-3.5 mr-1" /> Polícia
                </Button>
              </div>
              <Button className="w-full h-10 font-bold bg-green-600 hover:bg-green-700" onClick={handleFinalizar}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Finalizar Atendimento
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
