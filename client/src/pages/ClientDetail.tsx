import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useRoute } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Phone, Mail, Shield, Camera, MapPin, Radio, Plus } from "lucide-react";
import { toast } from "sonner";

export default function ClientDetail() {
  const [, params] = useRoute("/clients/:id");
  const clientId = Number(params?.id);

  const { data: client } = trpc.monitoredClient.get.useQuery({ id: clientId }, { enabled: !!clientId });
  const { data: contacts = [], refetch: refetchContacts } = trpc.clientContact.list.useQuery({ clientId }, { enabled: !!clientId });
  const { data: systems = [], refetch: refetchSystems } = trpc.alarmSystem.list.useQuery({ clientId }, { enabled: !!clientId });
  const { data: cameras = [], refetch: refetchCameras } = trpc.camera.list.useQuery({ clientId }, { enabled: !!clientId });

  // Mutations
  const createContact = trpc.clientContact.create.useMutation({ onSuccess: () => { refetchContacts(); toast.success("Contato adicionado!"); } });
  const createSystem = trpc.alarmSystem.create.useMutation({ onSuccess: () => { refetchSystems(); toast.success("Sistema cadastrado!"); } });
  const createCamera = trpc.camera.create.useMutation({ onSuccess: () => { refetchCameras(); toast.success("Câmera adicionada!"); } });

  // Form states
  const [showContactForm, setShowContactForm] = useState(false);
  const [showSystemForm, setShowSystemForm] = useState(false);
  const [showCameraForm, setShowCameraForm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", whatsapp: "", email: "", role: "" });
  const [systemForm, setSystemForm] = useState({ account: "", brand: "JFL" as any, model: "", receiverPort: 0 });
  const [cameraForm, setCameraForm] = useState({ name: "", rtspUrl: "", brand: "", location: "" });

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
                  <span className="text-sm"><strong>Telefone:</strong> {client.phone || "Não informado"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm"><strong>WhatsApp:</strong> {client.whatsapp || "Não informado"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm"><strong>E-mail:</strong> {client.email || "Não informado"}</span>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm"><strong>Endereço:</strong> {client.address || "Não informado"} - {client.city}/{client.state} {client.zipCode}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CONTATOS */}
          <TabsContent value="contacts" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Dialog open={showContactForm} onOpenChange={setShowContactForm}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar Contato</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo Contato</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label>Nome</Label><Input value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} /></div>
                    <div><Label>Telefone</Label><Input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} /></div>
                    <div><Label>WhatsApp</Label><Input value={contactForm.whatsapp} onChange={(e) => setContactForm({ ...contactForm, whatsapp: e.target.value })} /></div>
                    <div><Label>E-mail</Label><Input value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} /></div>
                    <div><Label>Função</Label><Input placeholder="Ex: Proprietário" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} /></div>
                  </div>
                  <Button className="mt-3" onClick={() => { createContact.mutate({ clientId, ...contactForm }); setShowContactForm(false); setContactForm({ name: "", phone: "", whatsapp: "", email: "", role: "" }); }}>Salvar</Button>
                </DialogContent>
              </Dialog>
            </div>
            <ScrollArea className="h-[400px]">
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
                        {contact.whatsapp && <span>WhatsApp: {contact.whatsapp}</span>}
                        {contact.email && <span><Mail className="h-3 w-3 inline mr-1" />{contact.email}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {contacts.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhum contato cadastrado</p>}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* SISTEMAS DE ALARME */}
          <TabsContent value="systems" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Dialog open={showSystemForm} onOpenChange={setShowSystemForm}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar Sistema</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo Sistema de Alarme</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Conta (Contact ID)</Label><Input placeholder="0001" value={systemForm.account} onChange={(e) => setSystemForm({ ...systemForm, account: e.target.value })} /></div>
                    <div>
                      <Label>Marca</Label>
                      <Select value={systemForm.brand} onValueChange={(v) => setSystemForm({ ...systemForm, brand: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="JFL">JFL</SelectItem>
                          <SelectItem value="INTELBRAS">Intelbras</SelectItem>
                          <SelectItem value="VETTI">Vetti</SelectItem>
                          <SelectItem value="COMPATEC">Compatec</SelectItem>
                          <SelectItem value="RADIOENGE">Radioenge</SelectItem>
                          <SelectItem value="VIAWEB">ViaWeb</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Modelo</Label><Input placeholder="Ex: Active 20" value={systemForm.model} onChange={(e) => setSystemForm({ ...systemForm, model: e.target.value })} /></div>
                    <div><Label>Porta Receptor</Label><Input type="number" placeholder="9061" value={systemForm.receiverPort || ""} onChange={(e) => setSystemForm({ ...systemForm, receiverPort: Number(e.target.value) })} /></div>
                  </div>
                  <Button className="mt-3" onClick={() => { createSystem.mutate({ clientId, ...systemForm }); setShowSystemForm(false); setSystemForm({ account: "", brand: "JFL", model: "", receiverPort: 0 }); }}>Salvar</Button>
                </DialogContent>
              </Dialog>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="grid gap-3">
                {systems.map((system: any) => (
                  <Card key={system.id} className={`border-l-4 ${system.isOnline ? 'border-l-green-500' : 'border-l-red-500'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Shield className="h-5 w-5 text-primary" />
                          <div>
                            <p className="font-bold text-foreground font-mono">Conta: {system.account}</p>
                            <p className="text-sm text-muted-foreground">{system.brand} - {system.model || "Modelo não informado"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={system.isOnline ? "default" : "destructive"}>
                            {system.isOnline ? "Online" : "Offline"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">Porta {system.receiverPort}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {systems.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhum sistema cadastrado</p>}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* CÂMERAS */}
          <TabsContent value="cameras" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Dialog open={showCameraForm} onOpenChange={setShowCameraForm}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar Câmera</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nova Câmera</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Nome</Label><Input placeholder="Ex: Frente" value={cameraForm.name} onChange={(e) => setCameraForm({ ...cameraForm, name: e.target.value })} /></div>
                    <div><Label>Localização</Label><Input placeholder="Ex: Garagem" value={cameraForm.location} onChange={(e) => setCameraForm({ ...cameraForm, location: e.target.value })} /></div>
                    <div className="col-span-2"><Label>URL RTSP</Label><Input placeholder="rtsp://..." value={cameraForm.rtspUrl} onChange={(e) => setCameraForm({ ...cameraForm, rtspUrl: e.target.value })} /></div>
                    <div><Label>Marca</Label><Input placeholder="Ex: Intelbras" value={cameraForm.brand} onChange={(e) => setCameraForm({ ...cameraForm, brand: e.target.value })} /></div>
                  </div>
                  <Button className="mt-3" onClick={() => { createCamera.mutate({ clientId, ...cameraForm }); setShowCameraForm(false); setCameraForm({ name: "", rtspUrl: "", brand: "", location: "" }); }}>Salvar</Button>
                </DialogContent>
              </Dialog>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cameras.map((cam: any) => (
                  <Card key={cam.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Camera className="h-5 w-5 text-primary" />
                        <div className="min-w-0">
                          <p className="font-bold text-foreground">{cam.name}</p>
                          <p className="text-sm text-muted-foreground">{cam.location || "Sem localização"} {cam.brand ? `(${cam.brand})` : ""}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{cam.rtspUrl}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {cameras.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhuma câmera cadastrada</p>}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
