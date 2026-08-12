import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Search, Download } from "lucide-react";

export default function Reports() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [appliedFilters, setAppliedFilters] = useState<{ dateFrom: string; dateTo: string; account: string; clientId?: number; operatorName?: string }>({ dateFrom: "", dateTo: "", account: "" });

  const { data: clients = [] } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: allOccurrences = [] } = trpc.occurrence.list.useQuery({ limit: 200, offset: 0 });
  const operators = useMemo(() => Array.from(new Set(allOccurrences.map((item: any) => item.operatorName).filter(Boolean))).sort(), [allOccurrences]);

  const { data: occurrences = [] } = trpc.occurrence.list.useQuery({
    limit: 200,
    offset: 0,
    ...appliedFilters,
  });

  const filtered = occurrences;

  function handleSearch() {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return;
    }
    setAppliedFilters({
      dateFrom,
      dateTo,
      account: accountFilter,
      clientId: clientFilter === "all" ? undefined : Number(clientFilter),
      operatorName: operatorFilter === "all" ? undefined : operatorFilter,
    });
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setAccountFilter("");
    setClientFilter("all");
    setOperatorFilter("all");
    setAppliedFilters({ dateFrom: "", dateTo: "", account: "" });
  }

  function formatTime(ms: number | null | undefined) {
    if (!ms) return "-";
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}min ${sec}s`;
  }

  return (<DashboardLayout>
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6" /> Relatórios de Ocorrências
        </h1>
        <Badge variant="outline">{filtered.length} registros</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Data Início</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Data Fim</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Conta</label>
              <Input placeholder="Nº da conta" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Cliente</label>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger><SelectValue placeholder="Todos os clientes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {clients.map((client: any) => <SelectItem key={client.id} value={String(client.id)}>{client.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Operador</label>
              <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                <SelectTrigger><SelectValue placeholder="Todos os operadores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os operadores</SelectItem>
                  {operators.map((operator) => <SelectItem key={operator as string} value={operator as string}>{operator as string}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={handleSearch}><Search className="w-4 h-4 mr-2" /> Buscar</Button>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={clearFilters}>Limpar</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Ocorrências Finalizadas ({filtered.length})</CardTitle>
            <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" /> Exportar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left">Data/Hora</th>
                  <th className="p-2 text-left">Conta</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Evento</th>
                  <th className="p-2 text-left">Descrição</th>
                  <th className="p-2 text-left">Observações</th>
                  <th className="p-2 text-left">Tempo</th>
                  <th className="p-2 text-left">Operador</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhuma ocorrência encontrada</td></tr>
                ) : (
                  filtered.map((o: any) => (
                    <tr key={o.id} className="border-b hover:bg-muted/50">
                      <td className="p-2 whitespace-nowrap">{new Date(o.finalizedAt).toLocaleString("pt-BR")}</td>
                      <td className="p-2 font-mono">{o.account}</td>
                      <td className="p-2">{o.clientName || "-"}</td>
                      <td className="p-2"><Badge variant="outline">{o.qualifier || ""}{o.eventCode}</Badge></td>
                      <td className="p-2">{o.description || "-"}</td>
                      <td className="p-2 max-w-[200px] truncate">{o.observations || "-"}</td>
                      <td className="p-2 whitespace-nowrap">{formatTime(o.attendingTimeMs)}</td>
                      <td className="p-2 font-medium">{o.operatorName || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div></DashboardLayout>);
}
