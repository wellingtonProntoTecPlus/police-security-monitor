import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";

const RECEIVERS = [
  { brand: "JFL", ports: [9061, 9191, 9131, 9181] },
  { brand: "INTELBRAS", ports: [9071, 9271] },
  { brand: "VIAWEB", ports: [9111] },
  { brand: "VETTI", ports: [9161] },
  { brand: "COMPATEC", ports: [9112] },
  { brand: "RADIOENGE", ports: [9035, 9040] },
];

export default function Settings() {
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Configurações do RECIP</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Receptores TCP Configurados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {RECEIVERS.map((recv) => (
                <div key={recv.brand} className="bg-secondary/50 rounded-lg p-4">
                  <h3 className="font-bold text-foreground mb-2">{recv.brand}</h3>
                  <div className="flex flex-wrap gap-2">
                    {recv.ports.map((port) => (
                      <Badge key={port} variant="outline" className="font-mono">
                        :{port}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informações do Sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Versão:</strong> 1.0.0</p>
            <p><strong>Protocolo:</strong> Ademco Contact ID sobre TCP/IP</p>
            <p><strong>Centrais suportadas:</strong> JFL, Intelbras, Vetti, Compatec, Radioenge, ViaWeb</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

