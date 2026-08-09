import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Phone, Mail, Shield, Camera, MapPin, Radio } from "lucide-react";

export default function ClientDetail() {
  const [, params] = useRoute("/clients/:id");
  const clientId = Number(params?.id);

  const { data: client } = trpc.monitoredClient.get.useQuery({ id: clientId }, { enabled: !!clientId });
  const { data: contacts = [] } = trpc.clientContact.list.useQuery({ clientId }, { enabled: !!clientId });
  const { data: systems = [] } = trpc.alarmSystem.list.useQuery({ clientId }, { enabled: !!clientId });
  const { data: cameras = [] } = trpc.camera.list.useQuery({ clientId }, { enabled: !!clientId });

  if (!client) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header do cliente */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
            <p className="text-muted-foreground">{client.type === "pf" ? "CPF" : "CNPJ"}: {client.document}</p>
          </div>
          <Badge variant={client.isActive ? "default" : "destructive"} className="text-sm">
            {client.isActive ? "Ativo" : "Inativo"}
          </Badge>
        </div>

        <Tabs defaultValue="info" className="w-full">
          <TabsList>
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="contacts">Contatos ({contacts.length})</TabsTrigger>
            <TabsTrigger value="systems">Sistemas ({systems.length})</TabsTrigger>
            <TabsTrigger value="cameras">Câmeras ({cameras.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <Card>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{client.phone || "Não informado"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{client.email || "Não informado"}</span>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{client.address || "Não informado"} - {client.city}/{client.state}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            <div className="grid gap-3">
              {contacts.map((contact: any) => (
                <Card key={contact.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-bold text-foreground">{contact.name}</p>
                        <p className="text-sm text-muted-foreground">{contact.role || "Contato"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {contact.phone && <span><Phone className="h-3 w-3 inline mr-1" />{contact.phone}</span>}
                      {contact.email && <span><Mail className="h-3 w-3 inline mr-1" />{contact.email}</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {contacts.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhum contato cadastrado</p>}
            </div>
          </TabsContent>

          <TabsContent value="systems" className="mt-4">
            <div className="grid gap-3">
              {systems.map((system: any) => (
                <Card key={system.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-bold text-foreground">Conta: {system.account}</p>
                          <p className="text-sm text-muted-foreground">{system.brand} - {system.model || "Modelo não informado"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={system.isOnline ? "default" : "destructive"}>
                          {system.isOnline ? "Online" : "Offline"}
                        </Badge>
                        <Radio className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Porta {system.receiverPort}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {systems.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhum sistema cadastrado</p>}
            </div>
          </TabsContent>

          <TabsContent value="cameras" className="mt-4">
            <div className="grid grid-cols-2 gap-3">
              {cameras.map((cam: any) => (
                <Card key={cam.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Camera className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-bold text-foreground">{cam.name}</p>
                        <p className="text-sm text-muted-foreground">{cam.location || "Sem localização"}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">{cam.rtspUrl}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {cameras.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhuma câmera cadastrada</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
