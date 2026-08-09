import { trpc } from "@/lib/trpc";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Search, Download } from "lucide-react";

export default function Reports() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountFilter, setAccountFilter] = useState("");

  const { data: occurrences = [] } = trpc.occurrence.list.useQuery({
    limit: 100,
    offset: 0,
  });

  const filtered = occurrences.filter((o: any) => {
    if (accountFilter && !o.account?.includes(accountFilter)) return false;
    if (dateFrom && new Date(o.finalizedAt) < new Date(dateFrom)) return false;
    if (dateTo && new Date(o.finalizedAt) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  return (<DashboardLayout>
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6" /> Relatórios
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
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
            <div className="flex items-end">
              <Button className="w-full"><Search className="w-4 h-4 mr-2" /> Buscar</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Ocorrências ({filtered.length})</CardTitle>
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
                  <th className="p-2 text-left">Evento</th>
                  <th className="p-2 text-left">Descrição</th>
                  <th className="p-2 text-left">Tempo</th>
                  <th className="p-2 text-left">Operador</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhuma ocorrência encontrada</td></tr>
                ) : (
                  filtered.map((o: any) => (
                    <tr key={o.id} className="border-b hover:bg-muted/50">
                      <td className="p-2">{new Date(o.finalizedAt).toLocaleString("pt-BR")}</td>
                      <td className="p-2 font-mono">{o.account}</td>
                      <td className="p-2"><Badge variant="outline">{o.eventCode}</Badge></td>
                      <td className="p-2">{o.eventDescription}</td>
                      <td className="p-2">{o.attendTime ? `${Math.floor(o.attendTime / 60)}min ${o.attendTime % 60}s` : "-"}</td>
                      <td className="p-2">{o.operatorId || "-"}</td>
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
