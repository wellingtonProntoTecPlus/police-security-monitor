import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, CalendarDays, Download, FileText, Radio, Search } from "lucide-react";
import { buildOccurrenceReportCsv, formatReportDate, formatReportDuration } from "./reportExport";

type ReportMode = "occurrences" | "events" | "connections";
type PeriodPreset = "today" | "yesterday" | "week" | "month" | "custom";
type EventGroup = "all" | "alarm" | "arm" | "disarm" | "test" | "system";

function dateInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function resolvePeriod(preset: Exclude<PeriodPreset, "custom">) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  if (preset === "today") return { dateFrom: dateInputValue(today), dateTo: dateInputValue(today) };
  if (preset === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { dateFrom: dateInputValue(yesterday), dateTo: dateInputValue(yesterday) };
  }
  if (preset === "week") {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return { dateFrom: dateInputValue(monday), dateTo: dateInputValue(end) };
  }
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return { dateFrom: dateInputValue(monthStart), dateTo: dateInputValue(end) };
}

const PERIOD_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mês" },
  { value: "custom", label: "Personalizado" },
];

const EVENT_OPTIONS: Array<{ value: EventGroup; label: string }> = [
  { value: "all", label: "Todos os eventos" },
  { value: "alarm", label: "Disparos e alarmes" },
  { value: "arm", label: "Arme" },
  { value: "disarm", label: "Desarme" },
  { value: "test", label: "Testes periódicos" },
  { value: "system", label: "Falhas e sistema" },
];

const DEFAULT_REPORT_LIMIT = 100;
const FILTERED_REPORT_LIMIT = 1000;

function hasActiveReportFilters(filters: {
  dateFrom: string;
  dateTo: string;
  account: string;
  clientId?: number;
  partnerCompanyId?: number;
  operatorName?: string;
  eventGroup: EventGroup;
}) {
  return Boolean(
    filters.dateFrom
    || filters.dateTo
    || filters.account.trim()
    || filters.clientId
    || filters.partnerCompanyId
    || filters.operatorName?.trim()
    || filters.eventGroup !== "all",
  );
}

export default function Reports() {
  const [reportMode, setReportMode] = useState<ReportMode>("occurrences");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("custom");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [eventGroup, setEventGroup] = useState<EventGroup>("all");
  const [connectionStatus, setConnectionStatus] = useState<"all" | "online" | "offline">("all");
  const [appliedFilters, setAppliedFilters] = useState<{ dateFrom: string; dateTo: string; account: string; clientId?: number; partnerCompanyId?: number; operatorName?: string; eventGroup: EventGroup; connectionStatus?: "online" | "offline" }>({ dateFrom: "", dateTo: "", account: "", eventGroup: "all" });

  const { data: clients = [] } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: partners = [] } = trpc.partnerCompany.list.useQuery(undefined);
  const { data: allOccurrences = [] } = trpc.occurrence.list.useQuery({ limit: 1000, offset: 0 });
  const operators = useMemo(() => Array.from(new Set(allOccurrences.map((item: any) => item.operatorName).filter(Boolean))).sort(), [allOccurrences]);
  const availableClients = useMemo(() => partnerFilter === "all"
    ? clients
    : clients.filter((client: any) => client.partnerCompanyId === Number(partnerFilter)), [clients, partnerFilter]);
  const hasAppliedFilters = hasActiveReportFilters(appliedFilters);
  const reportLimit = hasAppliedFilters ? FILTERED_REPORT_LIMIT : DEFAULT_REPORT_LIMIT;

  const { data: occurrences = [], isLoading: isLoadingOccurrences, error: occurrencesError } = trpc.occurrence.list.useQuery({ limit: reportLimit, offset: 0, ...appliedFilters });
  const { data: events = [], isLoading: isLoadingEvents, error: eventsError } = trpc.alarmEvent.report.useQuery({ limit: reportLimit, offset: 0, ...appliedFilters }, { enabled: reportMode === "events" });
  const { data: connectionRows = [], isLoading: isLoadingConnections, error: connectionsError } = trpc.alarmEvent.connectionReport.useQuery({
    clientId: appliedFilters.clientId,
    partnerCompanyId: appliedFilters.partnerCompanyId,
    status: appliedFilters.connectionStatus,
  }, { enabled: reportMode === "connections" });

  const isLoading = reportMode === "occurrences" ? isLoadingOccurrences : reportMode === "events" ? isLoadingEvents : isLoadingConnections;
  const error = reportMode === "occurrences" ? occurrencesError : reportMode === "events" ? eventsError : connectionsError;
  const currentRows = reportMode === "occurrences" ? occurrences : reportMode === "events" ? events : connectionRows;

  function currentInputFilters(overrides: Partial<{ dateFrom: string; dateTo: string }> = {}) {
    return {
      dateFrom: overrides.dateFrom ?? dateFrom,
      dateTo: overrides.dateTo ?? dateTo,
      account: accountFilter,
      clientId: clientFilter === "all" ? undefined : Number(clientFilter),
      partnerCompanyId: partnerFilter === "all" ? undefined : Number(partnerFilter),
      operatorName: operatorFilter === "all" ? undefined : operatorFilter,
      eventGroup,
      connectionStatus: connectionStatus === "all" ? undefined : connectionStatus,
    };
  }

  function handleSearch() {
    if (dateFrom && dateTo && dateFrom > dateTo) return;
    setAppliedFilters(currentInputFilters());
  }

  function applyPeriod(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset === "custom") return;
    const period = resolvePeriod(preset);
    setDateFrom(period.dateFrom);
    setDateTo(period.dateTo);
    setAppliedFilters(currentInputFilters(period));
  }

  function clearFilters() {
    setPeriodPreset("custom");
    setDateFrom("");
    setDateTo("");
    setAccountFilter("");
    setPartnerFilter("all");
    setClientFilter("all");
    setOperatorFilter("all");
    setEventGroup("all");
    setConnectionStatus("all");
    setAppliedFilters({ dateFrom: "", dateTo: "", account: "", eventGroup: "all" });
  }

  function handleExport() {
    if (!currentRows.length) return;
    const exportRows = currentRows.map((row: any) => reportMode === "connections" ? ({
      finalizedAt: row.lastKeepAliveAt,
      account: row.account,
      clientName: row.clientName,
      eventCode: row.connectionStatus === "online" ? "ONLINE" : "OFFLINE",
      description: row.connectionStatus === "online" ? "Central Online" : "Central Offline",
      observations: row.lastKeepAliveAt ? `Último Keep Alive: ${formatReportDate(row.lastKeepAliveAt)}` : "Nenhum Keep Alive registrado",
      operatorName: "Sistema",
    }) : ({
      ...row,
      finalizedAt: row.finalizedAt || row.receivedAt,
      observations: row.observations || row.autoFinalizationReason,
      operatorName: row.operatorName || (row.autoFinalized ? "Sistema" : ""),
    }));
    const blob = new Blob([buildOccurrenceReportCsv(exportRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-${reportMode}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <DashboardLayout>
    <div className="p-6 space-y-5 overflow-auto h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6" /> Relatórios Operacionais</h1>
          <p className="text-sm text-muted-foreground mt-1">Consulte ocorrências finalizadas, eventos recebidos e o status atual das centrais.</p>
        </div>
        <Badge variant="outline">{currentRows.length} registros</Badge>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap gap-2" aria-label="Tipo de relatório">
            <Button size="sm" variant={reportMode === "occurrences" ? "default" : "outline"} onClick={() => setReportMode("occurrences")}><FileText className="w-4 h-4 mr-1.5" /> Ocorrências finalizadas</Button>
            <Button size="sm" variant={reportMode === "events" ? "default" : "outline"} onClick={() => setReportMode("events")}><Activity className="w-4 h-4 mr-1.5" /> Eventos recebidos</Button>
            <Button size="sm" variant={reportMode === "connections" ? "default" : "outline"} onClick={() => setReportMode("connections")}><Radio className="w-4 h-4 mr-1.5" /> Online e Offline</Button>
          </div>

          <div className="flex flex-wrap gap-2 items-center border-y border-border py-3">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            {PERIOD_OPTIONS.map((period) => <Button key={period.value} size="sm" variant={periodPreset === period.value ? "secondary" : "ghost"} onClick={() => applyPeriod(period.value)}>{period.label}</Button>)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div><label className="text-sm text-muted-foreground">Data início</label><Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPeriodPreset("custom"); }} disabled={reportMode === "connections"} /></div>
            <div><label className="text-sm text-muted-foreground">Data fim</label><Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPeriodPreset("custom"); }} disabled={reportMode === "connections"} /></div>
            <div><label className="text-sm text-muted-foreground">Conta</label><Input placeholder="Nº da conta" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} disabled={reportMode === "connections"} /></div>
            <div><label className="text-sm text-muted-foreground">Empresa parceira</label><Select value={partnerFilter} onValueChange={(value) => { setPartnerFilter(value); setClientFilter("all"); }}><SelectTrigger><SelectValue placeholder="Todas as empresas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as empresas</SelectItem>{partners.map((partner: any) => <SelectItem key={partner.id} value={String(partner.id)}>{partner.name}</SelectItem>)}</SelectContent></Select></div>
            <div><label className="text-sm text-muted-foreground">Cliente</label><Select value={clientFilter} onValueChange={setClientFilter}><SelectTrigger><SelectValue placeholder="Todos os clientes" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os clientes</SelectItem>{availableClients.map((client: any) => <SelectItem key={client.id} value={String(client.id)}>{client.fantasyName || client.name}</SelectItem>)}</SelectContent></Select></div>
            {reportMode === "occurrences" && <div><label className="text-sm text-muted-foreground">Operador</label><Select value={operatorFilter} onValueChange={setOperatorFilter}><SelectTrigger><SelectValue placeholder="Todos os operadores" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os operadores</SelectItem>{operators.map((operator) => <SelectItem key={operator as string} value={operator as string}>{operator as string}</SelectItem>)}</SelectContent></Select></div>}
            {reportMode === "events" && <div><label className="text-sm text-muted-foreground">Evento</label><Select value={eventGroup} onValueChange={(value) => setEventGroup(value as EventGroup)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>}
            {reportMode === "connections" && <div><label className="text-sm text-muted-foreground">Status atual</label><Select value={connectionStatus} onValueChange={(value) => setConnectionStatus(value as "all" | "online" | "offline")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Online e Offline</SelectItem><SelectItem value="online">Somente Online</SelectItem><SelectItem value="offline">Somente Offline</SelectItem></SelectContent></Select></div>}
            <div className="flex items-end gap-2"><Button className="flex-1" onClick={handleSearch}><Search className="w-4 h-4 mr-2" /> Buscar</Button><Button variant="outline" onClick={clearFilters}>Limpar</Button></div>
          </div>
          {reportMode === "connections" && <p className="text-xs text-muted-foreground">Online e Offline refletem o status atual baseado no último Keep Alive; filtros de período e conta não se aplicam a esta consulta.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-lg">{reportMode === "occurrences" ? "Ocorrências finalizadas" : reportMode === "events" ? "Eventos recebidos" : "Status atual das centrais"} ({currentRows.length})</CardTitle>{reportMode !== "connections" && !hasAppliedFilters && <p className="mt-1 text-xs text-muted-foreground">Sem filtros: exibindo os {DEFAULT_REPORT_LIMIT} registros mais recentes.</p>}</div><Button variant="outline" size="sm" onClick={handleExport} disabled={!currentRows.length}><Download className="w-4 h-4 mr-2" /> Exportar CSV</Button></div></CardHeader>
        <CardContent><ScrollArea className="h-[500px]"><table className="w-full text-sm"><thead className="bg-muted sticky top-0"><tr>{reportMode === "connections" ? <><th className="p-2 text-left">Status</th><th className="p-2 text-left">Conta</th><th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Central</th><th className="p-2 text-left">Último Keep Alive</th><th className="p-2 text-left">Prazo</th></> : <><th className="p-2 text-left">Data/Hora</th><th className="p-2 text-left">Conta</th><th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Evento</th><th className="p-2 text-left">Descrição</th><th className="p-2 text-left">Finalização</th><th className="p-2 text-left">Tempo</th><th className="p-2 text-left">Operador</th></>}</tr></thead><tbody>
          {isLoading ? <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Carregando relatório…</td></tr> : error ? <tr><td colSpan={8} className="p-4 text-center text-destructive">Não foi possível carregar o relatório. Atualize a página e tente novamente.</td></tr> : !currentRows.length ? <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum registro encontrado para os filtros informados</td></tr> : reportMode === "connections" ? connectionRows.map((system: any) => <tr key={system.id} className="border-b hover:bg-muted/50"><td className="p-2"><Badge variant={system.connectionStatus === "online" ? "default" : "destructive"}>{system.connectionStatus === "online" ? "Online" : "Offline"}</Badge></td><td className="p-2 font-mono">{system.account}</td><td className="p-2">{system.clientName || "-"}</td><td className="p-2">{[system.brand, system.model].filter(Boolean).join(" · ")}</td><td className="p-2 whitespace-nowrap">{formatReportDate(system.lastKeepAliveAt)}</td><td className="p-2">{system.keepAliveOfflineAfterMinutes || "-"} min</td></tr>) : currentRows.map((row: any) => <tr key={row.id} className="border-b hover:bg-muted/50"><td className="p-2 whitespace-nowrap">{formatReportDate(row.finalizedAt || row.receivedAt)}</td><td className="p-2 font-mono">{row.account}</td><td className="p-2">{row.clientName || (row.account === "0000" ? "Conta do Sistema" : "-")}</td><td className="p-2"><Badge variant="outline">{row.qualifier || ""}{row.eventCode}</Badge></td><td className="p-2">{row.description || "-"}</td><td className="p-2 max-w-[220px] truncate">{row.observations || row.autoFinalizationReason || "-"}</td><td className="p-2 whitespace-nowrap">{formatReportDuration(row.attendingTimeMs)}</td><td className="p-2 font-medium">{row.operatorName || (row.autoFinalized ? "Sistema" : "-")}</td></tr>)}
        </tbody></table></ScrollArea></CardContent>
      </Card>
    </div>
  </DashboardLayout>;
}
