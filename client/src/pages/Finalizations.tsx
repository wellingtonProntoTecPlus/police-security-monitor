import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle } from "lucide-react";

export default function Finalizations() {
  const { data: occurrences = [] } = trpc.occurrence.list.useQuery({
    limit: 200,
    offset: 0,
  });

  return (<DashboardLayout>
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CheckCircle className="w-6 h-6" /> Finalizações
        </h1>
        <Badge variant="secondary">{occurrences.length} registros</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-3 text-left">ID</th>
                  <th className="p-3 text-left">Data/Hora</th>
                  <th className="p-3 text-left">Conta</th>
                  <th className="p-3 text-left">Código</th>
                  <th className="p-3 text-left">Descrição</th>
                  <th className="p-3 text-left">Observações</th>
                  <th className="p-3 text-left">Tempo</th>
                  <th className="p-3 text-left">E-mail</th>
                  <th className="p-3 text-left">Push</th>
                </tr>
              </thead>
              <tbody>
                {occurrences.length === 0 ? (
                  <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Nenhuma finalização registrada ainda</td></tr>
                ) : (
                  occurrences.map((o: any) => (
                    <tr key={o.id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{o.id}</td>
                      <td className="p-3">{new Date(o.finalizedAt).toLocaleString("pt-BR")}</td>
                      <td className="p-3 font-mono">{o.account}</td>
                      <td className="p-3"><Badge variant="outline">{o.eventCode}</Badge></td>
                      <td className="p-3 max-w-[200px] truncate">{o.eventDescription}</td>
                      <td className="p-3 max-w-[200px] truncate">{o.observations || "-"}</td>
                      <td className="p-3">{o.attendTime ? `${Math.floor(o.attendTime / 60)}m${o.attendTime % 60}s` : "-"}</td>
                      <td className="p-3">{o.sentEmail ? <Badge className="bg-green-600">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</td>
                      <td className="p-3">{o.sentPush ? <Badge className="bg-green-600">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</td>
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
