import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Search, Shield, ArrowLeft, Save, Wifi, Radio, Clock, Camera, Users, Layers } from "lucide-react";
import { toast } from "sonner";
import { ALARM_SYSTEM_BRANDS, applyAlarmSystemBrandProfile, getAlarmSystemIdentifierValidationError, getAlarmSystemProfile, isJflVersion7OrLater, type AlarmSystemBrand } from "@shared/alarmSystemProfiles";

const BRANDS = ALARM_SYSTEM_BRANDS;

const INITIAL_FORM = {
  clientId: 0,
  partnerId: 0,
  account: "",
  brand: "" as string,
  model: "",
  firmwareVersion: "",
  serialNumber: "",
  communicationType: "ethernet" as "ethernet" | "gprs" | "both",
  macAddress: "",
  imeiGprs: "",
  viawebCode: "",
  receiverPort: 0,
  partitions: 1,
  ipAddress: "",
  installDate: "",
  batteryDate: "",
  keepAliveMonitoringEnabled: true,
  keepAliveExpectedIntervalSeconds: 60,
  keepAliveFailureEventEnabled: false,
  keepAliveOfflineAfterMinutes: 5,
  keepAliveDisconnectAlertEnabled: true,
  keepAliveRepeatAlertEnabled: false,
  keepAliveRepeatAlertEveryMinutes: 60,
};

function requiresJflVersion7OrLaterSerial(brand: string, firmwareVersion: string) {
  return isJflVersion7OrLater(brand, firmwareVersion);
}

export default function AlarmSystems() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "create">("list");
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [selectedPartner, setSelectedPartner] = useState(0);

  const { data: systems = [], refetch } = trpc.alarmSystem.list.useQuery(undefined);
  const { data: partners = [] } = trpc.partnerCompany.list.useQuery(undefined);
  const { data: allClients = [] } = trpc.monitoredClient.list.useQuery(undefined);

  // Filtrar clientes pela parceira selecionada
  const filteredClients = selectedPartner
    ? allClients.filter((c: any) => c.partnerCompanyId === selectedPartner)
    : allClients;

  const createMutation = trpc.alarmSystem.create.useMutation({
    onSuccess: () => {
      toast.success("Sistema de alarme cadastrado!");
      setView("list");
      setForm({ ...INITIAL_FORM });
      setSelectedPartner(0);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredSystems = systems.filter((s: any) =>
    s.account.includes(search) || s.brand.toLowerCase().includes(search.toLowerCase())
  );

  // Gerar número da conta automaticamente
  function generateAccount(clientId: number) {
    const client = allClients.find((c: any) => c.id === clientId);
    if (client) {
      const prefix = (client.fantasyName || client.name).substring(0, 2).toUpperCase();
      const nextNum = String(systems.length + 1).padStart(4, "0");
      setForm((prev) => ({ ...prev, account: `${prefix}${nextNum}`, clientId }));
    } else {
      setForm((prev) => ({ ...prev, clientId }));
    }
  }

  function handleSubmit() {
    if (!form.clientId) { toast.error("Selecione o cliente"); return; }
    if (!form.account.trim()) { toast.error("Informe o número da conta"); return; }
    if (!form.brand) { toast.error("Selecione a marca"); return; }
    const identifierError = getAlarmSystemIdentifierValidationError(form);
    if (identifierError) { toast.error(identifierError); return; }

    const payload: any = {
      clientId: form.clientId,
      account: form.account,
      brand: form.brand,
      model: form.model || undefined,
      firmwareVersion: form.firmwareVersion || undefined,
      serialNumber: form.serialNumber || undefined,
      communicationType: form.communicationType,
      macAddress: form.macAddress || undefined,
      imeiGprs: form.imeiGprs || undefined,
      receiverPort: form.receiverPort || undefined,
      partitions: form.partitions,
      ipAddress: form.ipAddress || undefined,
      installDate: form.installDate ? new Date(form.installDate) : undefined,
      batteryDate: form.batteryDate ? new Date(form.batteryDate) : undefined,
      keepAliveMonitoringEnabled: form.keepAliveMonitoringEnabled,
      keepAliveExpectedIntervalSeconds: form.keepAliveExpectedIntervalSeconds,
      keepAliveFailureEventEnabled: form.keepAliveFailureEventEnabled,
      keepAliveOfflineAfterMinutes: form.keepAliveOfflineAfterMinutes,
      keepAliveDisconnectAlertEnabled: form.keepAliveDisconnectAlertEnabled,
      keepAliveRepeatAlertEnabled: form.keepAliveRepeatAlertEnabled,
      keepAliveRepeatAlertEveryMinutes: form.keepAliveRepeatAlertEveryMinutes,
    };
    createMutation.mutate(payload);
  }

  // ===== VIEW: FORMULÁRIO =====
  if (view === "create") {
    return (
      <DashboardLayout>
        <div className="h-full overflow-auto">
          <div className="p-6 max-w-[1400px] mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <Button variant="ghost" size="sm" onClick={() => setView("list")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <h1 className="text-xl font-bold text-foreground">Cadastrar Sistema de Alarme</h1>
            </div>

            <div className="grid grid-cols-12 gap-6">
              {/* COLUNA PRINCIPAL */}
              <div className="col-span-8 space-y-6">
                {/* Empresa e Cliente */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Empresa e Cliente</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-3">
                        <Label className="text-sm font-medium">Empresa Parceira *</Label>
                        <Select onValueChange={(v) => { setSelectedPartner(Number(v)); setForm({ ...form, clientId: 0 }); }}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a parceira..." /></SelectTrigger>
                          <SelectContent>
                            {partners.map((p: any) => (
                              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Label className="text-sm font-medium">Cliente *</Label>
                        <Select onValueChange={(v) => generateAccount(Number(v))} disabled={!selectedPartner}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder={selectedPartner ? "Selecione o cliente..." : "Selecione a parceira primeiro"} /></SelectTrigger>
                          <SelectContent>
                            {filteredClients.map((c: any) => (
                              <SelectItem key={c.id} value={String(c.id)}>{c.fantasyName || c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Central de Alarme */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Shield className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Central de Alarme</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Marca *</Label>
                        <Select value={form.brand} onValueChange={(v) => setForm(applyAlarmSystemBrandProfile(form, v as AlarmSystemBrand) as typeof form)}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Marca" /></SelectTrigger>
                          <SelectContent>
                            {BRANDS.map((b) => (
                              <SelectItem key={b} value={b}>{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-xs text-muted-foreground">{getAlarmSystemProfile(form.brand)?.identificationLabel}</p>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Modelo</Label>
                        <Input className="mt-1" placeholder="Ex: Active 20 Ultra" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Versão/Firmware</Label>
                        <Input className="mt-1" placeholder="Ex: v3.2.1" value={form.firmwareVersion} onChange={(e) => setForm({ ...form, firmwareVersion: e.target.value })} />
                      </div>
                      {requiresJflVersion7OrLaterSerial(form.brand, form.firmwareVersion) && <div className="col-span-3"><Label className="text-sm font-medium text-amber-300">Número de Série * (JFL v7 ou superior)</Label><Input className="mt-1 font-mono" inputMode="numeric" maxLength={10} placeholder="2801936621" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })} /><span className="text-xs text-muted-foreground">Informe os 10 caracteres do número de série.</span></div>}
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Nº da Conta *</Label>
                        <Input className="mt-1 font-mono font-bold text-lg" placeholder="PS0001" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value.toUpperCase() })} />
                        <span className="text-xs text-muted-foreground">2 letras do cliente + 4 dígitos</span>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Partições (até 8)</Label>
                        <Input className="mt-1" type="number" min={1} max={8} value={form.partitions} onChange={(e) => setForm({ ...form, partitions: Number(e.target.value) })} />
                      </div>
                      {form.brand === "VIAWEB" && <div className="col-span-2 rounded border border-orange-500/30 bg-orange-500/5 p-3 text-sm text-orange-200">O ID ISEP de quatro caracteres será gerado automaticamente ao salvar este sistema.</div>}
                    </div>
                  </CardContent>
                </Card>

                {/* Comunicação */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Wifi className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Comunicação</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Tipo de Comunicação *</Label>
                        <Select value={form.communicationType} onValueChange={(v) => setForm({ ...form, communicationType: v as any })}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ethernet">Ethernet / IP</SelectItem>
                            <SelectItem value="gprs">GPRS</SelectItem>
                            <SelectItem value="both">Ethernet + GPRS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">MAC (últimos 6 dígitos)</Label>
                        <Input className="mt-1 font-mono uppercase" placeholder="A1B2C3" maxLength={6} value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value.toUpperCase().replace(/[^0-9A-F]/gi, "").slice(0, 6) })} />
                        <span className="text-xs text-muted-foreground">Identifica no dashboard</span>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">IMEI GPRS (últimos 6 dígitos)</Label>
                        <Input className="mt-1 font-mono uppercase" placeholder="123456" maxLength={6} value={form.imeiGprs} onChange={(e) => setForm({ ...form, imeiGprs: e.target.value.toUpperCase().replace(/[^0-9A-F]/gi, "").slice(0, 6) })} />
                        <span className="text-xs text-muted-foreground">Use quando a central comunica por GPRS</span>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">IP do Receptor</Label>
                        <Input className="mt-1 font-mono" placeholder="192.168.0.100" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Porta receptora</Label>
                        <Select value={String(form.receiverPort || "")} onValueChange={(value) => setForm({ ...form, receiverPort: Number(value) })} disabled={!form.brand}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a marca" /></SelectTrigger>
                          <SelectContent>{(getAlarmSystemProfile(form.brand)?.receiverPorts || []).map((port) => <SelectItem key={port} value={String(port)}>{port}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-emerald-500/30">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4"><Radio className="h-5 w-5 text-emerald-400" /><h3 className="font-bold text-foreground">Supervisão Keep Alive</h3></div>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-foreground"><input type="checkbox" checked={form.keepAliveMonitoringEnabled} onChange={(event) => setForm({ ...form, keepAliveMonitoringEnabled: event.target.checked })} /> Monitorar Keep Alive desta central</label>
                      <div><Label className="text-sm font-medium">Frequência técnica (segundos)</Label><Input className="mt-1" type="number" min={1} max={86400} disabled={!form.keepAliveMonitoringEnabled} value={form.keepAliveExpectedIntervalSeconds} onChange={(event) => setForm({ ...form, keepAliveExpectedIntervalSeconds: Math.max(1, Number(event.target.value) || 60) })} /><p className="mt-1 text-xs text-muted-foreground">Padrão: 60 segundos. Informe a frequência configurada na central.</p></div>
                      <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.keepAliveFailureEventEnabled} disabled={!form.keepAliveMonitoringEnabled} onChange={(event) => setForm({ ...form, keepAliveFailureEventEnabled: event.target.checked })} /> Gerar evento de falha de Keep Alive</label>
                      <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.keepAliveDisconnectAlertEnabled} disabled={!form.keepAliveMonitoringEnabled} onChange={(event) => setForm({ ...form, keepAliveDisconnectAlertEnabled: event.target.checked })} /> Gerar alerta de painel desconectado</label>
                      <div><Label className="text-sm font-medium">Painel desconectado após (minutos)</Label><Input className="mt-1" type="number" min={1} max={1440} disabled={!form.keepAliveMonitoringEnabled || !form.keepAliveDisconnectAlertEnabled} value={form.keepAliveOfflineAfterMinutes} onChange={(event) => setForm({ ...form, keepAliveOfflineAfterMinutes: Math.max(1, Number(event.target.value) || 5) })} /></div>
                      <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={form.keepAliveRepeatAlertEnabled} disabled={!form.keepAliveMonitoringEnabled || !form.keepAliveDisconnectAlertEnabled} onChange={(event) => setForm({ ...form, keepAliveRepeatAlertEnabled: event.target.checked })} /> Repetir alerta de painel desconectado</label>
                      {form.keepAliveRepeatAlertEnabled && <div><Label className="text-sm font-medium">Repetir alerta a cada (minutos)</Label><Input className="mt-1" type="number" min={1} max={10080} disabled={!form.keepAliveMonitoringEnabled || !form.keepAliveDisconnectAlertEnabled} value={form.keepAliveRepeatAlertEveryMinutes} onChange={(event) => setForm({ ...form, keepAliveRepeatAlertEveryMinutes: Math.max(1, Number(event.target.value) || 60) })} /></div>}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* COLUNA LATERAL */}
              <div className="col-span-4 space-y-6">
                {/* Datas */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Clock className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Datas</h3>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Data de Instalação</Label>
                        <Input className="mt-1" type="date" value={form.installDate} onChange={(e) => setForm({ ...form, installDate: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Data da Bateria</Label>
                        <Input className="mt-1" type="date" value={form.batteryDate} onChange={(e) => setForm({ ...form, batteryDate: e.target.value })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Resumo */}
                <Card className="border-primary/30">
                  <CardContent className="p-5">
                    <h3 className="font-bold text-foreground mb-3">Resumo</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Conta:</span><span className="font-mono font-bold">{form.account || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Marca:</span><span>{form.brand || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Comunicação:</span><span>{form.communicationType === "both" ? "ETH+GPRS" : form.communicationType.toUpperCase()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">MAC:</span><span className="font-mono">{form.macAddress || "—"}</span></div>
                      {form.serialNumber && <div className="flex justify-between"><span className="text-muted-foreground">Serial:</span><span className="font-mono">{form.serialNumber}</span></div>}
                      <div className="flex justify-between"><span className="text-muted-foreground">Partições:</span><span>{form.partitions}</span></div>
                    </div>
                    <Separator className="my-4" />
                    <p className="text-xs text-muted-foreground mb-3">
                      Após cadastrar, adicione: Zonas, Usuários, PGMs, Câmeras e Tabela de Horários na tela de detalhes do sistema.
                    </p>
                  </CardContent>
                </Card>

                {/* Botão Salvar */}
                <Button onClick={handleSubmit} disabled={createMutation.isPending} className="w-full h-12 text-base font-bold">
                  <Save className="h-5 w-5 mr-2" />
                  {createMutation.isPending ? "Salvando..." : "Cadastrar Sistema"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ===== VIEW: LISTA =====
  return (
    <DashboardLayout>
      <div className="h-full overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Sistemas de Alarme</h1>
          <Button onClick={() => setView("create")}>
            <Plus className="h-4 w-4 mr-2" /> Novo Sistema
          </Button>
        </div>

        <div className="relative max-w-lg mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por conta ou marca..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[100px_100px_1fr_100px_100px_80px_100px] gap-4 px-6 py-3 bg-secondary/50 border-b border-border text-xs font-bold text-muted-foreground uppercase">
            <span>Conta</span>
            <span>Marca</span>
            <span>Modelo</span>
            <span>Comunic.</span>
            <span>MAC</span>
            <span>Part.</span>
            <span>Status</span>
          </div>
          {filteredSystems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum sistema de alarme encontrado</div>
          ) : (
            filteredSystems.map((sys: any) => (
              <div key={sys.id} className="grid grid-cols-[100px_100px_1fr_100px_100px_80px_100px] gap-4 px-6 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors items-center">
                <span className="font-mono font-bold text-foreground">{sys.account}</span>
                <Badge variant="outline" className="text-xs justify-center">{sys.brand}</Badge>
                <span className="text-sm text-foreground">{sys.model || "—"}</span>
                <span className="text-xs text-muted-foreground">{sys.communicationType === "both" ? "ETH+GPRS" : (sys.communicationType || "ETH").toUpperCase()}</span>
                <span className="font-mono text-xs text-muted-foreground">{sys.macAddress || "—"}</span>
                <span className="text-xs text-center text-muted-foreground">{sys.partitions}</span>
                <Badge variant={sys.isActive ? "default" : "destructive"} className="text-xs justify-center">
                  {sys.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
