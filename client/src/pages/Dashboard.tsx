import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSocket, AlarmEvent } from "@/hooks/useSocket";
import {
  Bell, Radio, Clock, Users, AlertTriangle,
  Filter, Search, Wifi, WifiOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Dashboard() {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [searchAccount, setSearchAccount] = useState("");
  const [filterBrand, setFilterBrand] = useState("all");

  // Socket.IO para eventos em tempo real
  const { connected, realtimeEvents } = useSocket();

  // Atualizar relógio
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Queries (fallback + stats)
  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { refetchInterval: 10000 });
  const { data: dbEvents = [] } = trpc.alarmEvent.list.useQuery({ limit: 50 }, { refetchInterval: 15000 });
  const { data: incidents = [] } = trpc.incident.list.useQuery(undefined, { refetchInterval: 5000 });

  // Combinar eventos: tempo real primeiro, depois DB (sem duplicatas)
  const allEvents = useMemo(() => {
    const rtIds = new Set(realtimeEvents.filter(e => e.id).map(e => e.id));
    const dbFiltered = dbEvents.filter((e: any) => !rtIds.has(e.id));
    return [...realtimeEvents, ...dbFiltered].slice(0, 100);
  }, [realtimeEvents, dbEvents]);

  const hora = currentTime.toLocaleTimeString("pt-BR");
  const data = currentTime.toLocaleDateString("pt-BR");

  // Contadores por status
  const incidentCounts = useMemo(() => {
    const counts = { waiting: 0, attending: 0, observing: 0, dispatched: 0 };
    incidents.forEach((inc: any) => {
      if (inc.status in counts) counts[inc.status as keyof typeof counts]++;
    });
    return counts;
  }, [incidents]);

  // Filtrar eventos
  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev: any) => {
      if (searchAccount && !ev.account?.includes(searchAccount)) return false;
      if (filterBrand !== "all" && ev.brand !== filterBrand) return false;
      return true;
    });
  }, [allEvents, searchAccount, filterBrand]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full gap-3 p-4">
        {/* HEADER DO DASHBOARD */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {connected ? (
                <>
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-green-400 font-bold text-lg">SISTEMA OPERACIONAL</span>
                  <Wifi className="h-4 w-4 text-green-400 ml-2" />
                </>
              ) : (
                <>
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="text-red-400 font-bold text-lg">RECONECTANDO...</span>
                  <WifiOff className="h-4 w-4 text-red-400 ml-2" />
                </>
              )}
            </div>
            {realtimeEvents.length > 0 && (
              <Badge variant="outline" className="text-xs border-green-500 text-green-400">
                {realtimeEvents.length} eventos ao vivo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold font-mono text-foreground tracking-wider">{hora}</span>
            <span className="text-muted-foreground text-lg">{data}</span>
            <div className="border-l border-border pl-4 flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                {user?.name?.charAt(0) || "A"}
              </div>
              <span className="font-bold text-foreground">{user?.name || "OPERADOR"}</span>
            </div>
          </div>
        </div>

        {/* CARDS DE STATUS */}
        <div className="grid grid-cols-5 gap-3">
          <Card className="bg-card border-blue-500/30">
            <CardContent className="p-3 flex items-center gap-3">
              <Radio className="h-8 w-8 text-blue-400" />
              <div>
                <p className="text-xs text-muted-foreground">CONEXÕES ATIVAS</p>
                <p className="text-2xl font-bold text-foreground">{stats?.activeConnections ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-yellow-500/30">
            <CardContent className="p-3 flex items-center gap-3">
              <Bell className="h-8 w-8 text-yellow-400" />
              <div>
                <p className="text-xs text-muted-foreground">EVENTOS PENDENTES</p>
                <p className="text-2xl font-bold text-foreground">{stats?.pendingEvents ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-cyan-500/30">
            <CardContent className="p-3 flex items-center gap-3">
              <Clock className="h-8 w-8 text-cyan-400" />
              <div>
                <p className="text-xs text-muted-foreground">EVENTOS / MIN</p>
                <p className="text-2xl font-bold text-foreground">{stats?.eventsPerMin ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-green-500/30">
            <CardContent className="p-3 flex items-center gap-3">
              <Users className="h-8 w-8 text-green-400" />
              <div>
                <p className="text-xs text-muted-foreground">CLIENTES ATIVOS</p>
                <p className="text-2xl font-bold text-foreground">{stats?.totalClients ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-red-500/30">
            <CardContent className="p-3 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">AGUARDANDO</p>
                <p className="text-2xl font-bold text-foreground">{incidentCounts.waiting}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FILAS DE ATENDIMENTO */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-yellow-400 font-bold">AGUARDANDO</p>
            <p className="text-xl font-bold text-yellow-300">{incidentCounts.waiting}</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-blue-400 font-bold">EM ATENDIMENTO</p>
            <p className="text-xl font-bold text-blue-300">{incidentCounts.attending}</p>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-purple-400 font-bold">EM OBSERVAÇÃO</p>
            <p className="text-xl font-bold text-purple-300">{incidentCounts.observing}</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-orange-400 font-bold">ENVIOU TÁTICO</p>
            <p className="text-xl font-bold text-orange-300">{incidentCounts.dispatched}</p>
          </div>
        </div>

        {/* FILTROS */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conta..."
              className="pl-9 bg-card border-border"
              value={searchAccount}
              onChange={(e) => setSearchAccount(e.target.value)}
            />
          </div>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-40 bg-card border-border">
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
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
          <Badge variant="outline" className="text-xs font-mono">
            {filteredEvents.length} eventos
          </Badge>
        </div>

        {/* GRID DE EVENTOS */}
        <div className="flex-1 min-h-0 bg-card border border-border rounded-lg overflow-hidden">
          {/* Header da tabela */}
          <div className="grid grid-cols-[80px_70px_100px_60px_1fr_50px_70px_120px] gap-2 px-4 py-2 bg-secondary/50 border-b border-border text-xs font-bold text-muted-foreground uppercase">
            <span>Hora</span>
            <span>Conta</span>
            <span>Marca</span>
            <span>Código</span>
            <span>Descrição</span>
            <span>Part.</span>
            <span>Zona</span>
            <span>IP</span>
          </div>
          <ScrollArea className="h-[calc(100vh-520px)]">
            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                <Bell className="h-6 w-6 opacity-50" />
                <span>Aguardando eventos...</span>
                {connected && <span className="text-xs text-green-400">Socket.IO conectado - pronto para receber</span>}
              </div>
            ) : (
              filteredEvents.map((ev: any, idx: number) => (
                <div
                  key={ev.id || `rt-${idx}`}
                  className={`grid grid-cols-[80px_70px_100px_60px_1fr_50px_70px_120px] gap-2 px-4 py-2 border-b border-border/50 hover:bg-secondary/30 transition-colors items-center text-sm ${
                    ev.priority === 'critical' ? 'border-l-4 border-l-red-500 bg-red-500/5' :
                    ev.priority === 'high' ? 'border-l-4 border-l-orange-500 bg-orange-500/5' :
                    ev.priority === 'medium' ? 'border-l-4 border-l-yellow-500' :
                    'border-l-4 border-l-green-500'
                  } ${!ev.id ? 'animate-pulse' : ''}`}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {ev.receivedAt ? new Date(ev.receivedAt).toLocaleTimeString("pt-BR") : ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString("pt-BR") : "--:--:--"}
                  </span>
                  <span className="font-mono font-bold text-foreground">{ev.account}</span>
                  <span className="text-xs text-foreground">{ev.brand}</span>
                  <Badge variant="outline" className={`text-xs ${
                    ev.qualifier === 'E' ? 'border-red-500 text-red-400' : 'border-green-500 text-green-400'
                  }`}>
                    {ev.qualifier}{ev.eventCode}
                  </Badge>
                  <span className="text-foreground truncate">{ev.description || `Evento ${ev.eventCode}`}</span>
                  <span className="font-mono text-xs text-muted-foreground">{ev.partition}</span>
                  <span className="font-mono text-xs text-muted-foreground">{ev.zoneUser}</span>
                  <span className="font-mono text-xs text-muted-foreground">{ev.remoteIp}</span>
                </div>
              ))
            )}
          </ScrollArea>
        </div>
      </div>
    </DashboardLayout>
  );
}

