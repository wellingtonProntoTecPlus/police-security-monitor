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
import { maskPhone } from "@/lib/masks";

const RECEIVER_PORTS: Record<string, number[]> = {
  JFL: [9061, 9191, 9131],
  INTELBRAS: [9071, 9271],
  VETTI: [9161],
  COMPATEC: [9112],
  RADIOENGE: [9035, 9040],
  VIAWEB: [9111],
};

function portsForBrand(brand: string) {
  return RECEIVER_PORTS[brand] || [];
}

export default function ClientDetail() {
  const [, params] = useRoute("/clients/:id");
  const clientId = Number(params?.id);

  const { data: client } = trpc.monitoredClient.get.useQuery({ id: clientId }, { enabled: !!clientId });
  const { data: contacts = [], refetch: refetchContacts } = trpc.clientContact.list.useQuery({ clientId }, { enabled: !!clientId });
  const { data: systems = [], refetch: refetchSystems } = trpc.alarmSystem.list.useQuery({ clientId }, { enabled: !!clientId });
  const { data: cameras = [], refetch: refetchCameras } = trpc.camera.list.useQuery({ clientId }, { enabled: !!clientId });

  // Zonas são vinculadas ao sistema selecionado do cliente.
  const [zoneSystemId, setZoneSystemId] = useState<number | undefined>(undefined);
  const activeZoneSystemId = zoneSystemId || systems[0]?.id;
  const { data: zones = [], refetch: refetchZones } = trpc.alarmZone.list.useQuery({ alarmSystemId: activeZoneSystemId || 0 }, { enabled: !!activeZoneSystemId });

  // Mutations
  const createContact = trpc.clientContact.create.useMutation({ onSuccess: () => { refetchContacts(); toast.success("Contato adicionado!"); } });
  const deleteContact = trpc.clientContact.delete.useMutation({ onSuccess: () => { refetchContacts(); toast.success("Contato excluído!"); } });
  const updateContact = trpc.clientContact.update.useMutation({ onSuccess: () => { refetchContacts(); setEditingContact(null); toast.success("Contato atualizado!"); } });
  const createSystem = trpc.alarmSystem.create.useMutation({ onSuccess: () => { refetchSystems(); toast.success("Sistema cadastrado!"); } });
  const deleteSystem = trpc.alarmSystem.delete.useMutation({ onSuccess: () => { refetchSystems(); toast.success("Sistema excluído!"); } });
  const updateSystem = trpc.alarmSystem.update.useMutation({ onSuccess: () => { refetchSystems(); setEditingSystem(null); toast.success("Sistema atualizado!"); } });
  const createCamera = trpc.camera.create.useMutation({ onSuccess: () => { refetchCameras(); toast.success("Câmera adicionada!"); } });
  const deleteCamera = trpc.camera.delete.useMutation({ onSuccess: () => { refetchCameras(); toast.success("Câmera excluída!"); } });
  const updateCamera = trpc.camera.update.useMutation({ onSuccess: () => { refetchCameras(); toast.success("Câmera atualizada!"); setEditingCamera(null); } });
  const createZone = trpc.alarmZone.create.useMutation({ onSuccess: () => { refetchZones(); toast.success("Zona adicionada!"); } });
  const deleteZone = trpc.alarmZone.delete.useMutation({ onSuccess: () => { refetchZones(); toast.success("Zona excluída!"); } });
  const updateZone = trpc.alarmZone.update.useMutation({ onSuccess: () => { refetchZones(); setEditingZone(null); toast.success("Zona atualizada!"); } });

  // Form states
  const [showContactForm, setShowContactForm] = useState(false);
  const [showSystemForm, setShowSystemForm] = useState(false);
  const [showCameraForm, setShowCameraForm] = useState(false);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [editingSystem, setEditingSystem] = useState<any>(null);
  const [editingZone, setEditingZone] = useState<any>(null);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", whatsapp: "", email: "", role: "", password: "", counterPassword: "", coercionPassword: "" });
  const [systemForm, setSystemForm] = useState({
    account: "", brand: "JFL" as any, model: "", communicationType: "ethernet" as any,
    macAddress: "", imeiGprs: "", viawebCode: "", receiverPort: 9061,
  });
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
            <TabsTrigger value="contacts">Contatos e Credenciais ({contacts.length})</TabsTrigger>
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
            <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                <span>Ao adicionar ou editar um contato, informe na seção <strong className="text-foreground">Credenciais de Segurança</strong> a Senha, a Contra senha e, se houver, a Senha de coação.</span>
              </div>
              <Dialog open={showContactForm} onOpenChange={setShowContactForm}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar Contato</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                  <DialogHeader><DialogTitle>Novo Contato</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label>Nome *</Label><Input value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} /></div>
                    <div><Label>Telefone</Label><Input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
                    <div><Label>WhatsApp</Label><Input value={contactForm.whatsapp} onChange={(e) => setContactForm({ ...contactForm, whatsapp: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
                    <div><Label>E-mail</Label><Input value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} /></div>
                    <div><Label>Função</Label><Input placeholder="Ex: Proprietário" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} /></div>
                    <div className="col-span-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                      <div className="mb-3 flex items-center gap-2"><Shield className="h-4 w-4 text-amber-400" /><div><p className="text-sm font-semibold text-foreground">Credenciais de Segurança</p><p className="text-xs text-muted-foreground">Dados usados pelo operador para confirmar a identidade do contato.</p></div></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Senha</Label><Input value={contactForm.password} onChange={(e) => setContactForm({ ...contactForm, password: e.target.value })} /></div>
                        <div><Label>Contra senha</Label><Input value={contactForm.counterPassword} onChange={(e) => setContactForm({ ...contactForm, counterPassword: e.target.value })} /></div>
                        <div className="col-span-2"><Label>Senha de coação</Label><Input value={contactForm.coercionPassword} onChange={(e) => setContactForm({ ...contactForm, coercionPassword: e.target.value })} /></div>
                      </div>
                    </div>
                  </div>
                  <Button className="mt-3" onClick={() => { if (!contactForm.name) { toast.error("Nome é obrigatório"); return; } createContact.mutate({ clientId, ...contactForm }); setShowContactForm(false); setContactForm({ name: "", phone: "", whatsapp: "", email: "", role: "", password: "", counterPassword: "", coercionPassword: "" }); }}>Salvar</Button>
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
                        {(contact.password || contact.counterPassword || contact.coercionPassword) && <span className="text-amber-400">Credenciais cadastradas</span>}
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-400" onClick={() => setEditingContact({ ...contact })} title="Editar contato">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => { if (confirm("Excluir este contato?")) deleteContact.mutate({ id: contact.id }); }} title="Excluir contato">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {contacts.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhum contato cadastrado</p>}
              </div>
            </ScrollArea>
            {editingContact && (
              <Dialog open={!!editingContact} onOpenChange={() => setEditingContact(null)}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                  <DialogHeader><DialogTitle>Editar Contato</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label>Nome *</Label><Input value={editingContact.name || ""} onChange={(e) => setEditingContact({ ...editingContact, name: e.target.value })} /></div>
                    <div><Label>Telefone</Label><Input value={editingContact.phone || ""} onChange={(e) => setEditingContact({ ...editingContact, phone: maskPhone(e.target.value) })} /></div>
                    <div><Label>WhatsApp</Label><Input value={editingContact.whatsapp || ""} onChange={(e) => setEditingContact({ ...editingContact, whatsapp: maskPhone(e.target.value) })} /></div>
                    <div><Label>E-mail</Label><Input value={editingContact.email || ""} onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })} /></div>
                    <div><Label>Função</Label><Input value={editingContact.role || ""} onChange={(e) => setEditingContact({ ...editingContact, role: e.target.value })} /></div>
                    <div className="col-span-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                      <div className="mb-3 flex items-center gap-2"><Shield className="h-4 w-4 text-amber-400" /><div><p className="text-sm font-semibold text-foreground">Credenciais de Segurança</p><p className="text-xs text-muted-foreground">Atualize os dados de validação utilizados pelo operador.</p></div></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Senha</Label><Input value={editingContact.password || ""} onChange={(e) => setEditingContact({ ...editingContact, password: e.target.value })} /></div>
                        <div><Label>Contra senha</Label><Input value={editingContact.counterPassword || ""} onChange={(e) => setEditingContact({ ...editingContact, counterPassword: e.target.value })} /></div>
                        <div className="col-span-2"><Label>Senha de coação</Label><Input value={editingContact.coercionPassword || ""} onChange={(e) => setEditingContact({ ...editingContact, coercionPassword: e.target.value })} /></div>
                      </div>
                    </div>
                  </div>
                  <Button className="mt-3" onClick={() => {
                    if (!editingContact.name?.trim()) { toast.error("Nome é obrigatório"); return; }
                    updateContact.mutate({ id: editingContact.id, name: editingContact.name, phone: editingContact.phone || "", whatsapp: editingContact.whatsapp || "", email: editingContact.email || "", role: editingContact.role || "", password: editingContact.password || "", counterPassword: editingContact.counterPassword || "", coercionPassword: editingContact.coercionPassword || "" });
                  }}>Salvar Alterações</Button>
                </DialogContent>
              </Dialog>
            )}
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
                      <Select value={systemForm.brand} onValueChange={(v) => setSystemForm({ ...systemForm, brand: v, receiverPort: portsForBrand(v)[0] || 0 })}>
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
                    <div>
                      <Label>Comunicação</Label>
                      <Select value={systemForm.communicationType} onValueChange={(communicationType) => setSystemForm({ ...systemForm, communicationType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="ethernet">Ethernet</SelectItem><SelectItem value="gprs">GPRS</SelectItem><SelectItem value="both">Ethernet + GPRS</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div><Label>MAC Ethernet (últimos 6)</Label><Input maxLength={6} placeholder="A1B2C3" value={systemForm.macAddress} onChange={(e) => setSystemForm({ ...systemForm, macAddress: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></div>
                    <div><Label>IMEI GPRS (últimos 6)</Label><Input maxLength={6} placeholder="123456" value={systemForm.imeiGprs} onChange={(e) => setSystemForm({ ...systemForm, imeiGprs: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></div>
                    {systemForm.brand === "VIAWEB" && <div><Label>ID ISEP (ViaWeb)</Label><Input value="Gerado ao salvar" disabled /></div>}
                    <div>
                      <Label>Porta receptora</Label>
                      <Select value={String(systemForm.receiverPort)} onValueChange={(value) => setSystemForm({ ...systemForm, receiverPort: Number(value) })}>
                        <SelectTrigger><SelectValue placeholder="Selecione a porta" /></SelectTrigger>
                        <SelectContent>{portsForBrand(systemForm.brand).map((port) => <SelectItem key={port} value={String(port)}>{port}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  {systemForm.brand === "VIAWEB" && <p className="mt-3 text-xs text-muted-foreground">O ID ISEP ViaWeb é gerado automaticamente com 4 caracteres. Ele é separado da Conta Contact ID e deve ser programado apenas no campo ISEP próprio da central ViaWeb.</p>}
                  <Button className="mt-3" onClick={() => {
                    if (!systemForm.account.trim()) { toast.error("Conta ou identificador do painel é obrigatório"); return; }
                    createSystem.mutate({ clientId, ...systemForm });
                    setShowSystemForm(false);
                    setSystemForm({ account: "", brand: "JFL", model: "", communicationType: "ethernet", macAddress: "", imeiGprs: "", viawebCode: "", receiverPort: 9061 });
                  }}>Salvar</Button>
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
                          <p className="text-xs text-muted-foreground font-mono">{system.brand === "VIAWEB" ? `ISEP: ${system.isepId || "Gerado ao salvar edição"} · ` : ""}MAC: {system.macAddress || "—"} · IMEI: {system.imeiGprs || "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={system.isOnline ? "default" : "destructive"}>
                          {system.isOnline ? "Online" : "Offline"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Porta {system.receiverPort}</span>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-400" onClick={() => setEditingSystem({ ...system })} title="Editar sistema">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
            {editingSystem && (
              <Dialog open={!!editingSystem} onOpenChange={() => setEditingSystem(null)}>
                <DialogContent>
                  <DialogHeader><DialogTitle>Editar Sistema de Alarme</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Conta *</Label><Input value={editingSystem.account || ""} onChange={(e) => setEditingSystem({ ...editingSystem, account: e.target.value })} /></div>
                    <div><Label>Marca</Label><Select value={editingSystem.brand} onValueChange={(brand) => setEditingSystem({ ...editingSystem, brand, receiverPort: portsForBrand(brand)[0] || 0 })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="JFL">JFL</SelectItem><SelectItem value="INTELBRAS">Intelbras</SelectItem><SelectItem value="VETTI">Vetti</SelectItem><SelectItem value="COMPATEC">Compatec</SelectItem><SelectItem value="RADIOENGE">Radioenge</SelectItem><SelectItem value="VIAWEB">ViaWeb</SelectItem></SelectContent></Select></div>
                    <div><Label>Modelo</Label><Input value={editingSystem.model || ""} onChange={(e) => setEditingSystem({ ...editingSystem, model: e.target.value })} /></div>
                    <div><Label>MAC Ethernet (últimos 6)</Label><Input maxLength={6} value={editingSystem.macAddress || ""} onChange={(e) => setEditingSystem({ ...editingSystem, macAddress: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></div>
                    <div><Label>IMEI GPRS (últimos 6)</Label><Input maxLength={6} value={editingSystem.imeiGprs || ""} onChange={(e) => setEditingSystem({ ...editingSystem, imeiGprs: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></div>
                    {editingSystem.brand === "VIAWEB" && <div><Label>ID ISEP (ViaWeb)</Label><Input value={editingSystem.isepId || "Será gerado ao salvar"} disabled /></div>}
                    <div><Label>Porta receptora</Label><Select value={String(editingSystem.receiverPort || portsForBrand(editingSystem.brand)[0] || "")} onValueChange={(value) => setEditingSystem({ ...editingSystem, receiverPort: Number(value) })}><SelectTrigger><SelectValue placeholder="Seleção de porta" /></SelectTrigger><SelectContent>{portsForBrand(editingSystem.brand).map((port) => <SelectItem key={port} value={String(port)}>{port}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                  <Button className="mt-3" onClick={() => {
                    if (!editingSystem.account?.trim()) { toast.error("Conta é obrigatória"); return; }
                    updateSystem.mutate({ id: editingSystem.id, account: editingSystem.account, brand: editingSystem.brand, model: editingSystem.model || "", macAddress: editingSystem.macAddress || "", imeiGprs: editingSystem.imeiGprs || "", receiverPort: Number(editingSystem.receiverPort) || 0 });
                  }}>Salvar Alterações</Button>
                </DialogContent>
              </Dialog>
            )}
          </TabsContent>

          {/* ZONAS / SETORES */}
          <TabsContent value="zones" className="mt-4 space-y-4">
            {!activeZoneSystemId ? (
              <p className="text-muted-foreground text-center py-8">Cadastre um sistema de alarme primeiro para adicionar zonas/setores</p>
            ) : (
              <>
                {systems.length > 1 && <div className="flex items-center gap-3 rounded border border-border bg-card p-3"><Label>Sistema para zonas</Label><select className="h-9 rounded border border-border bg-background px-2" value={String(activeZoneSystemId)} onChange={(e) => setZoneSystemId(Number(e.target.value))}>{systems.map((system: any) => <option key={system.id} value={system.id}>Conta {system.account} — {system.brand}</option>)}</select></div>}
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
                      <Button className="mt-3" onClick={() => { if (!zoneForm.name) { toast.error("Nome é obrigatório"); return; } createZone.mutate({ alarmSystemId: activeZoneSystemId, ...zoneForm }); setShowZoneForm(false); setZoneForm({ zoneNumber: zoneForm.zoneNumber + 1, name: "", type: "perimeter", partition: 1 }); }}>Salvar</Button>
                    </DialogContent>
                  </Dialog>
                </div>
                <ScrollArea className="h-[400px]">
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[60px_1fr_120px_80px_76px] gap-4 px-4 py-2 bg-secondary/50 border-b border-border text-xs font-bold text-muted-foreground uppercase">
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
                        <div key={zone.id} className="grid grid-cols-[60px_1fr_120px_80px_76px] gap-4 px-4 py-2 border-b border-border/50 items-center">
                          <span className="font-mono font-bold text-primary">{String(zone.zoneNumber).padStart(3, '0')}</span>
                          <span className="text-foreground">{zone.name}</span>
                          <Badge variant="outline" className="text-xs justify-center">{zone.type || "—"}</Badge>
                          <span className="text-sm text-muted-foreground text-center">{zone.partition || "—"}</span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-400" onClick={() => setEditingZone({ ...zone })} title="Editar zona"><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => { if (confirm("Excluir esta zona?")) deleteZone.mutate({ id: zone.id }); }} title="Excluir zona"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                {editingZone && (
                  <Dialog open={!!editingZone} onOpenChange={() => setEditingZone(null)}>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Editar Zona / Setor</DialogTitle></DialogHeader>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Nº da Zona *</Label><Input type="number" value={editingZone.zoneNumber || ""} onChange={(e) => setEditingZone({ ...editingZone, zoneNumber: Number(e.target.value) })} /></div>
                        <div><Label>Nome *</Label><Input value={editingZone.name || ""} onChange={(e) => setEditingZone({ ...editingZone, name: e.target.value })} /></div>
                        <div><Label>Tipo</Label><Select value={editingZone.type || "perimeter"} onValueChange={(type) => setEditingZone({ ...editingZone, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="perimeter">Perímetro</SelectItem><SelectItem value="internal">Interna</SelectItem><SelectItem value="24h">24 Horas</SelectItem><SelectItem value="fire">Incêndio</SelectItem><SelectItem value="panic">Pânico</SelectItem><SelectItem value="medical">Médico</SelectItem></SelectContent></Select></div>
                        <div><Label>Partição</Label><Input type="number" min={1} max={8} value={editingZone.partition || 1} onChange={(e) => setEditingZone({ ...editingZone, partition: Number(e.target.value) })} /></div>
                      </div>
                      <Button className="mt-3" onClick={() => {
                        if (!editingZone.name?.trim()) { toast.error("Nome é obrigatório"); return; }
                        updateZone.mutate({ id: editingZone.id, zoneNumber: Number(editingZone.zoneNumber), name: editingZone.name, type: editingZone.type, partition: Number(editingZone.partition) || 1 });
                      }}>Salvar Alterações</Button>
                    </DialogContent>
                  </Dialog>
                )}
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
