import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Wifi, WifiOff } from "lucide-react";

export default function AlarmSystems() {
  const { data: systems = [] } = trpc.alarmSystem.list.useQuery(undefined);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Sistemas de Alarme</h1>

        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {systems.map((system: any) => (
              <Card key={system.id} className={`border-l-4 ${system.isOnline ? 'border-l-green-500' : 'border-l-red-500'}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <span className="font-bold font-mono text-lg text-foreground">{system.account}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {system.isOnline ? (
                        <Wifi className="h-4 w-4 text-green-400" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-red-400" />
                      )}
                      <Badge variant={system.isOnline ? "default" : "destructive"} className="text-xs">
                        {system.isOnline ? "Online" : "Offline"}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p><strong>Marca:</strong> {system.brand}</p>
                    <p><strong>Modelo:</strong> {system.model || "-"}</p>
                    <p><strong>Porta:</strong> {system.receiverPort || "-"}</p>
                    <p><strong>IP:</strong> {system.ipAddress || "-"}</p>
                    {system.lastCommunication && (
                      <p><strong>Última com.:</strong> {new Date(system.lastCommunication).toLocaleString("pt-BR")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {systems.length === 0 && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                Nenhum sistema de alarme cadastrado
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </DashboardLayout>
  );
}
