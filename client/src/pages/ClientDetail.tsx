import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useRoute } from "wouter";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Phone, Mail, Shield, Camera, MapPin, Plus, Trash2, Layers, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function ClientDetail() {
  const [, params] = useRoute("/clients/:id");
  const clientId = Number(params?.id);

  const { data: client } = trpc.monitoredClient.get.useQuery({ id: clientId }, { enabled: !!clientId });
  const { data: contacts = [], refetch: refetchContacts } = trpc.clientContact.list.useQuery({ clientId }, { enabled: !!clientId });
  const { data: systems = [], refetch: refetchSystems } = trpc.alarmSystem.list.useQuery({ clientId }, { enabled: !!clientId });
  const { data: cameras = [], refetch: refetchCameras } = trpc.camera.list.useQuery({ clientId }, { enabled: !!clientId });

  // Zonas - buscar do primeiro sistema
  const firstSystemId = systems[0]?.id;
  const { data: zones = [], refetch: refetchZones } = trpc.alarmZone.list.useQuery({ alarmSystemId: firstSystemId || 0 }, { enabled: !!firstSystemId });

  // Mutations
  const createContact = trpc.clientContact.create.useMutation({ onSuccess: () => { refetchContacts(); toast.success("Contato adicionado!"); } });
  const deleteContact = trpc.clientContact.delete.useMutation({ onSuccess: () => { refetchContacts(); toast.success("Contato excluído!"); } });
  const createSystem = trpc.alarmSystem.create.useMutation({ onSuccess: () => { refetchSystems(); toast.success("Sistema cadastrado!"); } });
  const deleteSystem = trpc.alarmSystem.delete.useMutation({ onSuccess: () => { refetchSystems(); toast.success("Sistema excluído!"); } });
  const createCamera = trpc.camera.create.useMutation({ onSuccess: () => { refetchCameras(); toast.success("Câmera adicionada!"); } });
  const deleteCamera = trpc.camera.delete.useMutation({ onSuccess: () => { refetchCameras(); toast.success("Câmera excluída!"); } });
  const updateCamera = trpc.camera.update.useMutation({ onSuccess: () => { refetchCameras(); toast.success("Câmera atualizada!"); setEditingCamera(null); } });
  const createZone = trpc.alarmZone.create.useMutation({ onSuccess: () => { refetchZones(); toast.success("Zona adicionada!"); } });
  const deleteZone = trpc.alarmZone.delete.useMutation({ onSuccess: () => { refetchZones(); toast.success("Zona excluída!"); } });

  // Form states
  const [showContactForm, setShowContactForm] = useState(false);
  const [showSystemForm, setShowSystemForm] = useState(false);
  const [showCameraForm, setShowCameraForm] = useState(false);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", whatsapp: "", email: "", role: "" });
  const [systemForm, setSystemForm] = useState({ account: "", brand: "JFL" as any, model: "", receiverPort: 0 });
  const [cameraForm, setCameraForm] = useState({ name: "", rtspUrl: "", brand: "", location: "" });
  const [editingCamera, setEditingCamera] = useState<any>(null);
  const [zoneForm, setZoneForm] = useState({ zoneNumber: 1, name: "", type: "perimeter" as any, partition: 1 });

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
      <div className="p-6 space-y-6 overflow-auto h-full">
        {/* Header do cliente */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
            <p className="text-muted-foreground">{client.type === "pf" ? "CPF" : "CNPJ"}: {client.document} {client.fantasyName ? `| ${client.fantasyName}` : ""}</p>
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
            <TabsTrigger value="zones">Zonas/Setores ({zones.length})</TabsTrigger>
            <TabsTrigger value="cameras">Câmeras ({cameras.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <Card>
              <CardContent className="p-6 grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm"><strong>Telefone:</strong> {client.phone || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-green-400" />
                  <span className="text-sm"><strong>WhatsApp:</strong> {client.whatsapp || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm"><strong>E-mail:</strong> {client.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2 col-span-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm"><strong>Endereço:</strong> {client.address || "—"}{client.number ? `, ${client.number}` : ""} - {client.neighborhood || ""} - {client.city}/{client.state} CEP: {client.zipCode || "—"}</span>
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
                    <div className="col-span-2"><Label>Nome *</Label><Input value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} /></div>
                    <div><Label>Telefone</Label><Input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
                    <div><Label>WhatsApp</Label><Input value={contactForm.whatsapp} onChange={(e) => setContactForm({ ...contactForm, whatsapp: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
                    <div><Label>E-mail</Label><Input value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} /></div>
                    <div><Label>Função</Label><Input placeholder="Ex: Proprietário" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} /></div>
                  </div>
                  <Button className="mt-3" onClick={() => { if (!contactForm.name) { toast.error("Nome é obrigatório"); return; } createContact.mutate({ clientId, ...contactForm }); setShowContactForm(false); setContactForm({ name: "", phone: "", whatsapp: "", email: "", role: "" }); }}>Salvar</Button>
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
                        {contact.whatsapp && <span className="text-green-400">WA: {contact.whatsapp}</span>}
                        {contact.email && <span><Mail className="h-3 w-3 inline mr-1" />{contact.email}</span>}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => { if (confirm("Excluir este contato?")) deleteContact.mutate({ id: contact.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
                    <div><Label>Conta (Contact ID) *</Label><Input placeholder="0001" value={systemForm.account} onChange={(e) => setSystemForm({ ...systemForm, account: e.target.value })} /></div>
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
                    <CardContent className="p-4 flex items-center justify-between">
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
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => { if (confirm("Excluir este sistema?")) deleteSystem.mutate({ id: system.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {systems.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhum sistema cadastrado</p>}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ZONAS / SETORES */}
          <TabsContent value="zones" className="mt-4 space-y-4">
            {!firstSystemId ? (
              <p className="text-muted-foreground text-center py-8">Cadastre um sistema de alarme primeiro para adicionar zonas/setores</p>
            ) : (
              <>
                <div className="flex justify-end">
                  <Dialog open={showZoneForm} onOpenChange={setShowZoneForm}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar Zona</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Nova Zona / Setor</DialogTitle></DialogHeader>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Nº da Zona *</Label><Input type="number" value={zoneForm.zoneNumber} onChange={(e) => setZoneForm({ ...zoneForm, zoneNumber: Number(e.target.value) })} /></div>
                        <div><Label>Nome *</Label><Input placeholder="Ex: Porta da Sala" value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} /></div>
                        <div>
                          <Label>Tipo</Label>
                          <Select value={zoneForm.type} onValueChange={(v: any) => setZoneForm({ ...zoneForm, type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="perimeter">Perímetro</SelectItem>
                              <SelectItem value="internal">Interna</SelectItem>
                              <SelectItem value="24h">24 Horas</SelectItem>
                              <SelectItem value="fire">Incêndio</SelectItem>
                              <SelectItem value="panic">Pânico</SelectItem>
                              <SelectItem value="medical">Médico</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Partição</Label><Input type="number" min={1} max={8} value={zoneForm.partition} onChange={(e) => setZoneForm({ ...zoneForm, partition: Number(e.target.value) })} /></div>
                      </div>
                      <Button className="mt-3" onClick={() => { if (!zoneForm.name) { toast.error("Nome é obrigatório"); return; } createZone.mutate({ alarmSystemId: firstSystemId, ...zoneForm }); setShowZoneForm(false); setZoneForm({ zoneNumber: zoneForm.zoneNumber + 1, name: "", type: "perimeter", partition: 1 }); }}>Salvar</Button>
                    </DialogContent>
                  </Dialog>
                </div>
                <ScrollArea className="h-[400px]">
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[60px_1fr_120px_80px_60px] gap-4 px-4 py-2 bg-secondary/50 border-b border-border text-xs font-bold text-muted-foreground uppercase">
                      <span>Zona</span>
                      <span>Nome</span>
                      <span>Tipo</span>
                      <span>Partição</span>
                      <span>Ações</span>
                    </div>
                    {zones.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">Nenhuma zona cadastrada</p>
                    ) : (
                      zones.map((zone: any) => (
                        <div key={zone.id} className="grid grid-cols-[60px_1fr_120px_80px_60px] gap-4 px-4 py-2 border-b border-border/50 items-center">
                          <span className="font-mono font-bold text-primary">{String(zone.zoneNumber).padStart(3, '0')}</span>
                          <span className="text-foreground">{zone.name}</span>
                          <Badge variant="outline" className="text-xs justify-center">{zone.type || "—"}</Badge>
                          <span className="text-sm text-muted-foreground text-center">{zone.partition || "—"}</span>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => { if (confirm("Excluir esta zona?")) deleteZone.mutate({ id: zone.id }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
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
                    <div><Label>Nome *</Label><Input placeholder="Ex: Frente" value={cameraForm.name} onChange={(e) => setCameraForm({ ...cameraForm, name: e.target.value })} /></div>
                    <div><Label>Localização</Label><Input placeholder="Ex: Garagem" value={cameraForm.location} onChange={(e) => setCameraForm({ ...cameraForm, location: e.target.value })} /></div>
                    <div className="col-span-2"><Label>URL RTSP *</Label><Input placeholder="rtsp://..." value={cameraForm.rtspUrl} onChange={(e) => setCameraForm({ ...cameraForm, rtspUrl: e.target.value })} /></div>
                    <div><Label>Marca</Label><Input placeholder="Ex: Intelbras" value={cameraForm.brand} onChange={(e) => setCameraForm({ ...cameraForm, brand: e.target.value })} /></div>
                  </div>
                  <Button className="mt-3" onClick={() => { if (!cameraForm.name || !cameraForm.rtspUrl) { toast.error("Nome e URL são obrigatórios"); return; } createCamera.mutate({ clientId, ...cameraForm }); setShowCameraForm(false); setCameraForm({ name: "", rtspUrl: "", brand: "", location: "" }); }}>Salvar</Button>
                </DialogContent>
              </Dialog>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cameras.map((cam: any) => (
                  <Card key={cam.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Camera className="h-5 w-5 text-primary" />
                        <div className="min-w-0">
                          <p className="font-bold text-foreground">{cam.name}</p>
                          <p className="text-sm text-muted-foreground">{cam.location || "Sem localização"} {cam.brand ? `(${cam.brand})` : ""}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{cam.rtspUrl}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-400" onClick={() => setEditingCamera(cam)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => { if (confirm("Excluir esta câmera?")) deleteCamera.mutate({ id: cam.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {cameras.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhuma câmera cadastrada</p>}
              </div>
            </ScrollArea>

            {/* Modal de Edição de Câmera */}
            {editingCamera && (
              <Dialog open={!!editingCamera} onOpenChange={() => setEditingCamera(null)}>
                <DialogContent>
                  <DialogHeader><DialogTitle>Editar Câmera</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Nome *</Label><Input value={editingCamera.name} onChange={(e) => setEditingCamera({ ...editingCamera, name: e.target.value })} /></div>
                    <div><Label>Localização</Label><Input value={editingCamera.location || ""} onChange={(e) => setEditingCamera({ ...editingCamera, location: e.target.value })} /></div>
                    <div className="col-span-2"><Label>URL HLS/RTSP *</Label><Input value={editingCamera.rtspUrl} onChange={(e) => setEditingCamera({ ...editingCamera, rtspUrl: e.target.value })} /></div>
                    <div><Label>Marca</Label><Input value={editingCamera.brand || ""} onChange={(e) => setEditingCamera({ ...editingCamera, brand: e.target.value })} /></div>
                  </div>
                  <Button className="mt-3" onClick={() => {
                    if (!editingCamera.name || !editingCamera.rtspUrl) { toast.error("Nome e URL são obrigatórios"); return; }
                    updateCamera.mutate({ id: editingCamera.id, name: editingCamera.name, rtspUrl: editingCamera.rtspUrl, brand: editingCamera.brand || "", location: editingCamera.location || "" });
                  }}>Salvar Alterações</Button>
                </DialogContent>
              </Dialog>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
import { maskPhone } from "@/lib/masks";
