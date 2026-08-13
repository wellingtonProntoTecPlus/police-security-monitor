import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Building2, Phone, Mail, MapPin, ArrowLeft, Save, Upload, Calendar, Trash2, Pencil, Shield } from "lucide-react";
import { toast } from "sonner";

function maskCnpj(v: string) {
  const n = v.replace(/\D/g, "").slice(0, 14);
  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

function maskPhone(v: string) {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return `(${n}`;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

function maskCep(v: string) {
  const n = v.replace(/\D/g, "").slice(0, 8);
  if (n.length <= 5) return n;
  return `${n.slice(0, 5)}-${n.slice(5)}`;
}

const INITIAL_FORM = {
  managingCompanyId: 1,
  name: "",
  cnpj: "",
  phone: "",
  whatsapp: "",
  email: "",
  zipCode: "",
  address: "",
  city: "",
  state: "",
  logoUrl: "",
};

export default function Partners() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "create">("list");
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayType, setHolidayType] = useState<"nacional" | "municipal">("municipal");
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [editingPartner, setEditingPartner] = useState<any>(null);
  const [editingHoliday, setEditingHoliday] = useState<any>(null);
  const [tacticalForm, setTacticalForm] = useState({ name: "", phone: "", whatsapp: "", vehicle: "", plate: "", notes: "" });

  const { data: partners = [], refetch } = trpc.partnerCompany.list.useQuery(undefined);
  const { data: holidays = [], refetch: refetchHolidays } = trpc.partnerHoliday.list.useQuery(
    { partnerCompanyId: selectedPartnerId || 0 },
    { enabled: !!selectedPartnerId }
  );
  const { data: tacticalMobiles = [], refetch: refetchTacticalMobiles } = trpc.tacticalMobile.list.useQuery(
    { partnerCompanyId: selectedPartnerId || 0 },
    { enabled: !!selectedPartnerId }
  );
  const createMutation = trpc.partnerCompany.create.useMutation({
    onSuccess: () => {
      toast.success("Empresa parceira cadastrada!");
      setView("list");
      setForm({ ...INITIAL_FORM });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.partnerCompany.update.useMutation({
    onSuccess: () => {
      toast.success("Empresa parceira atualizada!");
      setView("list");
      setEditingPartner(null);
      setForm({ ...INITIAL_FORM });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const createHolidayMut = trpc.partnerHoliday.create.useMutation({ onSuccess: () => { refetchHolidays(); setHolidayName(""); setHolidayDate(""); toast.success("Feriado adicionado!"); } });
  const updateHolidayMut = trpc.partnerHoliday.update.useMutation({ onSuccess: () => { refetchHolidays(); setEditingHoliday(null); toast.success("Feriado atualizado!"); } });
  const deleteHolidayMut = trpc.partnerHoliday.delete.useMutation({ onSuccess: () => { refetchHolidays(); toast.success("Feriado removido!"); } });
  const createTacticalMobile = trpc.tacticalMobile.create.useMutation({ onSuccess: () => { refetchTacticalMobiles(); setTacticalForm({ name: "", phone: "", whatsapp: "", vehicle: "", plate: "", notes: "" }); toast.success("Tático móvel cadastrado!"); }, onError: (err) => toast.error(err.message) });
  const deleteTacticalMobile = trpc.tacticalMobile.delete.useMutation({ onSuccess: () => { refetchTacticalMobiles(); toast.success("Tático móvel removido!"); } });

  const deletePartnerMut = trpc.partnerCompany.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Parceira excluída!"); }, onError: (err: any) => toast.error("Erro: " + err.message) });
  const filteredPartners = partners.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.cnpj.includes(search.replace(/\D/g, ""))
  );
  const selectedPartner = partners.find((partner: any) => partner.id === selectedPartnerId);

  async function handleCepSearch(cep: string) {
    setForm(prev => ({ ...prev, zipCode: maskCep(cep) }));
    const clean = cep.replace(/\D/g, "");
    if (clean.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setForm(prev => ({ ...prev, address: data.logradouro || "", city: data.localidade || "", state: data.uf || "" }));
          toast.success("Endereço encontrado!");
        } else { toast.error("CEP não encontrado"); }
      } catch { toast.error("Erro ao buscar CEP"); }
    }
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Informe a Razão Social"); return; }
    if (!form.cnpj.trim()) { toast.error("Informe o CNPJ"); return; }
    const values = {
      ...form,
      cnpj: form.cnpj.replace(/\D/g, ""),
      phone: form.phone.replace(/\D/g, ""),
      whatsapp: form.whatsapp.replace(/\D/g, ""),
      zipCode: form.zipCode.replace(/\D/g, ""),
    };
    if (editingPartner) updateMutation.mutate({ id: editingPartner.id, ...values });
    else createMutation.mutate(values);
  }

  function openPartnerForm(partner?: any) {
    if (partner) {
      setEditingPartner(partner);
      setForm({
        managingCompanyId: partner.managingCompanyId || 1,
        name: partner.name || "",
        cnpj: maskCnpj(partner.cnpj || ""),
        phone: maskPhone(partner.phone || ""),
        whatsapp: maskPhone(partner.whatsapp || ""),
        email: partner.email || "",
        zipCode: maskCep(partner.zipCode || ""),
        address: partner.address || "",
        city: partner.city || "",
        state: partner.state || "",
        logoUrl: partner.logoUrl || "",
      });
    } else {
      setEditingPartner(null);
      setForm({ ...INITIAL_FORM });
    }
    setView("create");
  }

  // ===== VIEW: FORMULÁRIO =====
  if (view === "create") {
    return (
      <DashboardLayout>
        <div className="h-full overflow-auto">
          <div className="p-6 max-w-[1200px] mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <Button variant="ghost" size="sm" onClick={() => { setView("list"); setEditingPartner(null); setForm({ ...INITIAL_FORM }); }}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <h1 className="text-xl font-bold text-foreground">{editingPartner ? "Editar Empresa Parceira" : "Cadastrar Empresa Parceira"}</h1>
            </div>

            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-8 space-y-6">
                {/* Logo */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Upload className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Logo</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      {form.logoUrl ? (
                        <img src={form.logoUrl} alt="Logo" className="h-14 w-auto rounded border border-border bg-black/20 p-1" />
                      ) : (
                        <div className="h-14 w-14 rounded border border-dashed border-border flex items-center justify-center bg-secondary/30">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="URL do logo" className="flex-1" />
                    </div>
                  </CardContent>
                </Card>

                {/* Dados */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Dados da Empresa</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-4">
                        <Label className="text-sm font-medium">Razão Social *</Label>
                        <Input className="mt-1" placeholder="Razão Social" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">CNPJ *</Label>
                        <Input className="mt-1 font-mono" placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Endereço com CEP */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Endereço</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-1">
                        <Label className="text-sm font-medium">CEP</Label>
                        <Input className="mt-1 font-mono" placeholder="00000-000" value={form.zipCode} onChange={(e) => handleCepSearch(e.target.value)} />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-sm font-medium">Endereço</Label>
                        <Input className="mt-1" placeholder="Logradouro" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-sm font-medium">Cidade</Label>
                        <Input className="mt-1" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-sm font-medium">UF</Label>
                        <Input className="mt-1" maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="col-span-4 space-y-6">
                {/* Contatos */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Phone className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Contatos</h3>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Telefone</Label>
                        <Input className="mt-1 font-mono" placeholder="(00) 00000-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">WhatsApp</Label>
                        <Input className="mt-1 font-mono" placeholder="(00) 00000-0000" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: maskPhone(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">E-mail</Label>
                        <Input className="mt-1" type="email" placeholder="email@empresa.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="w-full h-12 text-base font-bold">
                  <Save className="h-5 w-5 mr-2" />
                  {createMutation.isPending || updateMutation.isPending ? "Salvando..." : editingPartner ? "Salvar Alterações" : "Cadastrar Parceira"}
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
          <h1 className="text-2xl font-bold text-foreground">Empresas Parceiras</h1>
          <Button onClick={() => openPartnerForm()}>
            <Plus className="h-4 w-4 mr-2" /> Nova Parceira
          </Button>
        </div>

        <div className="relative max-w-lg mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CNPJ..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-8">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_160px_140px_140px_100px_116px] gap-4 px-6 py-3 bg-secondary/50 border-b border-border text-xs font-bold text-muted-foreground uppercase">
                <span>Razão Social</span>
                <span>CNPJ</span>
                <span>Telefone</span>
                <span>Cidade/UF</span>
                <span>Status</span>
                <span>Configurar</span>
              </div>
              {filteredPartners.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Nenhuma empresa parceira encontrada</div>
              ) : (
                filteredPartners.map((partner: any) => (
                  <div key={partner.id} onClick={() => setSelectedPartnerId(partner.id)} className={`grid grid-cols-[1fr_160px_140px_140px_100px_116px] gap-4 px-6 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors items-center cursor-pointer ${selectedPartnerId === partner.id ? 'bg-primary/10' : ''}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {partner.logoUrl ? <img src={partner.logoUrl} alt="" className="h-7 w-7 rounded object-contain border border-border shrink-0" /> : <Building2 className="h-4 w-4 text-primary shrink-0" />}
                      <span className="font-medium text-foreground truncate">{partner.name}</span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{partner.cnpj}</span>
                    <span className="text-sm text-muted-foreground">{partner.phone || "—"}</span>
                    <span className="text-sm text-muted-foreground">{partner.city ? `${partner.city}/${partner.state}` : "—"}</span>
                    <Badge variant={partner.isActive ? "default" : "destructive"} className="text-xs justify-center">
                    {partner.isActive ? "Ativa" : "Inativa"}
                  </Badge>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-400 hover:text-amber-300" onClick={() => setSelectedPartnerId(partner.id)} title="Selecionar esta parceira para cadastrar Tático Móvel e feriados">
                      <Shield className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300" onClick={() => openPartnerForm(partner)} title="Editar parceira">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => {
                      if (confirm("Excluir esta parceira permanentemente?")) {
                        deletePartnerMut.mutate({ id: partner.id });
                      }
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
              )}
            </div>
          </div>

          {/* Painel de Feriados */}
          <div className="col-span-4 space-y-6">
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 mt-0.5 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-foreground">Configuração da Parceira</p>
                    {selectedPartner ? (
                      <p className="text-sm text-muted-foreground">Parceira selecionada: <strong className="text-foreground">{selectedPartner.name}</strong>. Cadastre abaixo os feriados e o Tático Móvel desta empresa.</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Clique sobre uma parceira da lista, ou no ícone de escudo amarelo, para liberar os cadastros de Feriados e Tático Móvel.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-foreground">Feriados</h3>
                </div>
                {!selectedPartnerId ? (
                  <p className="text-sm text-muted-foreground">Selecione uma parceira para gerenciar feriados</p>
                ) : (
                  <>
                    <div className="space-y-2 mb-4">
                      <div className="flex gap-2 items-end flex-wrap">
                        <div className="flex-1 min-w-[150px]">
                          <label className="text-xs text-muted-foreground">Nome</label>
                          <Input placeholder="Ex: Natal" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} />
                        </div>
                        <div className="w-[120px]">
                          <label className="text-xs text-muted-foreground">Dia/Mês{holidayType === "municipal" ? "/Ano" : ""}</label>
                          <Input placeholder={holidayType === "nacional" ? "25/12" : "20/01/2026"} value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
                        </div>
                        <div className="w-[120px]">
                          <label className="text-xs text-muted-foreground">Tipo</label>
                          <select className="w-full h-9 rounded border border-border bg-background px-2 text-sm" value={holidayType} onChange={(e) => setHolidayType(e.target.value as any)}>
                            <option value="nacional">Nacional</option>
                            <option value="municipal">Municipal</option>
                          </select>
                        </div>
                        <Button size="sm" className="h-9" onClick={() => {
                          if (!holidayName || !holidayDate) { toast.error("Preencha nome e data"); return; }
                          createHolidayMut.mutate({ partnerCompanyId: selectedPartnerId!, name: holidayName, date: holidayDate, type: holidayType });
                        }}><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="space-y-1.5 max-h-[300px] overflow-auto">
                      {holidays.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhum feriado cadastrado</p>
                      ) : (
                        holidays.map((h: any) => (
                          <div key={h.id} className="flex items-center justify-between bg-secondary/30 rounded px-3 py-1.5">
                            <div>
                              <span className="text-sm font-medium">{h.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{h.date}</span>
                              <span className={`text-xs ml-2 px-1.5 py-0.5 rounded ${h.type === 'nacional' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>{h.type || 'municipal'}</span>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-400" onClick={() => setEditingHoliday({ ...h })} title="Editar feriado"><Pencil className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => { if (confirm("Excluir este feriado?")) deleteHolidayMut.mutate({ id: h.id }); }} title="Excluir feriado"><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1"><Shield className="h-5 w-5 text-amber-400" /><h3 className="font-bold text-foreground">Tático Móvel</h3></div>
                <p className="text-xs text-muted-foreground mb-4">Cadastre a equipe ou agente que atende as ocorrências desta parceira.</p>
                {!selectedPartnerId ? <p className="text-sm text-muted-foreground">Selecione uma parceira para cadastrar o Tático Móvel</p> : <>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <Input placeholder="Nome da equipe ou agente *" value={tacticalForm.name} onChange={(e) => setTacticalForm({ ...tacticalForm, name: e.target.value })} />
                    <Input placeholder="Veículo" value={tacticalForm.vehicle} onChange={(e) => setTacticalForm({ ...tacticalForm, vehicle: e.target.value })} />
                    <Input placeholder="Telefone" value={tacticalForm.phone} onChange={(e) => setTacticalForm({ ...tacticalForm, phone: maskPhone(e.target.value) })} />
                    <Input placeholder="WhatsApp" value={tacticalForm.whatsapp} onChange={(e) => setTacticalForm({ ...tacticalForm, whatsapp: maskPhone(e.target.value) })} />
                    <Input className="col-span-2" placeholder="Veículo / placa" value={tacticalForm.plate} onChange={(e) => setTacticalForm({ ...tacticalForm, plate: e.target.value.toUpperCase() })} />
                    <Input className="col-span-2" placeholder="Observações" value={tacticalForm.notes} onChange={(e) => setTacticalForm({ ...tacticalForm, notes: e.target.value })} />
                  </div>
                  <Button size="sm" className="w-full mb-3" onClick={() => { if (!tacticalForm.name.trim()) { toast.error("Informe o nome da equipe ou agente"); return; } createTacticalMobile.mutate({ partnerCompanyId: selectedPartnerId, ...tacticalForm }); }}><Plus className="h-4 w-4 mr-1" /> Adicionar Tático</Button>
                  <div className="space-y-2 max-h-[220px] overflow-auto">{tacticalMobiles.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum Tático Móvel cadastrado</p> : tacticalMobiles.map((t: any) => <div key={t.id} className="flex justify-between gap-2 rounded bg-secondary/30 px-3 py-2"><div><p className="text-sm font-medium">{t.name}</p><p className="text-xs text-muted-foreground">{[t.vehicle, t.plate, t.phone || t.whatsapp].filter(Boolean).join(" · ") || "Sem dados adicionais"}</p></div><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => { if (confirm("Excluir este Tático Móvel?")) deleteTacticalMobile.mutate({ id: t.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>
                </>}
              </CardContent>
            </Card>
          </div>
        </div>
        {editingHoliday && (
          <Dialog open={!!editingHoliday} onOpenChange={() => setEditingHoliday(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Editar Feriado</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nome *</Label><Input value={editingHoliday.name || ""} onChange={(e) => setEditingHoliday({ ...editingHoliday, name: e.target.value })} /></div>
                <div><Label>Tipo</Label><select className="w-full h-9 rounded border border-border bg-background px-2 text-sm" value={editingHoliday.type || "municipal"} onChange={(e) => setEditingHoliday({ ...editingHoliday, type: e.target.value })}><option value="nacional">Nacional</option><option value="municipal">Municipal</option></select></div>
                <div><Label>Dia/Mês{editingHoliday.type === "municipal" ? "/Ano" : ""}</Label><Input placeholder={editingHoliday.type === "nacional" ? "25/12" : "20/01/2026"} value={editingHoliday.date || ""} onChange={(e) => setEditingHoliday({ ...editingHoliday, date: e.target.value })} /></div>
              </div>
              <Button className="mt-3" onClick={() => {
                if (!editingHoliday.name?.trim() || !editingHoliday.date?.trim()) { toast.error("Preencha nome e data"); return; }
                updateHolidayMut.mutate({ id: editingHoliday.id, name: editingHoliday.name, date: editingHoliday.date, type: editingHoliday.type || "municipal" });
              }}>Salvar Alterações</Button>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}
