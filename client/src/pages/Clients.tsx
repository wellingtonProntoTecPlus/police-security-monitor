import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Plus, Search, User, Building2, Phone, Mail, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// Máscaras
function maskPhone(v: string) {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return `(${n}`;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

function maskCpfCnpj(v: string, type: "pf" | "pj") {
  const n = v.replace(/\D/g, "");
  if (type === "pf") {
    const s = n.slice(0, 11);
    if (s.length <= 3) return s;
    if (s.length <= 6) return `${s.slice(0, 3)}.${s.slice(3)}`;
    if (s.length <= 9) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6)}`;
    return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  } else {
    const s = n.slice(0, 14);
    if (s.length <= 2) return s;
    if (s.length <= 5) return `${s.slice(0, 2)}.${s.slice(2)}`;
    if (s.length <= 8) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5)}`;
    if (s.length <= 12) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8)}`;
    return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
  }
}

function maskCep(v: string) {
  const n = v.replace(/\D/g, "").slice(0, 8);
  if (n.length <= 5) return n;
  return `${n.slice(0, 5)}-${n.slice(5)}`;
}

function validateCpf(cpf: string): boolean {
  const n = cpf.replace(/\D/g, "");
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(n[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(n[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(n[10]);
}

function validateCnpj(cnpj: string): boolean {
  const n = cnpj.replace(/\D/g, "");
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(n[i]) * weights1[i];
  let rest = sum % 11;
  if (rest < 2) { if (parseInt(n[12]) !== 0) return false; }
  else { if (parseInt(n[12]) !== 11 - rest) return false; }
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(n[i]) * weights2[i];
  rest = sum % 11;
  if (rest < 2) return parseInt(n[13]) === 0;
  return parseInt(n[13]) === 11 - rest;
}

const INITIAL_FORM = {
  partnerCompanyId: 0,
  type: "pj" as "pf" | "pj",
  name: "",
  fantasyName: "",
  document: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  zipCode: "",
};

export default function Clients() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [loadingCep, setLoadingCep] = useState(false);

  const { data: clients = [], refetch } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: partners = [] } = trpc.partnerCompany.list.useQuery(undefined);
  const createMutation = trpc.monitoredClient.create.useMutation({
    onSuccess: () => {
      toast.success("Cliente cadastrado com sucesso!");
      setShowCreate(false);
      setForm({ ...INITIAL_FORM });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Busca CEP via ViaCEP
  async function buscarCep(cep: string) {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          address: data.logradouro || prev.address,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
        toast.success("CEP encontrado!");
      } else {
        toast.error("CEP não encontrado");
      }
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  }

  const filteredClients = clients.filter((c: any) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.fantasyName && c.fantasyName.toLowerCase().includes(search.toLowerCase())) ||
    c.document.includes(search.replace(/\D/g, ""))
  );

  function handleSubmit() {
    if (!form.partnerCompanyId) { toast.error("Selecione a empresa responsável"); return; }
    if (!form.name.trim()) { toast.error("Informe a Razão Social / Nome"); return; }
    if (!form.document.trim()) { toast.error("Informe o CPF/CNPJ"); return; }
    const cleanDoc = form.document.replace(/\D/g, "");
    if (form.type === "pf" && !validateCpf(cleanDoc)) { toast.error("CPF inválido! Verifique os dígitos."); return; }
    if (form.type === "pj" && !validateCnpj(cleanDoc)) { toast.error("CNPJ inválido! Verifique os dígitos."); return; }
    createMutation.mutate({
      ...form,
      document: form.document.replace(/\D/g, ""),
      phone: form.phone.replace(/\D/g, ""),
      whatsapp: form.whatsapp.replace(/\D/g, ""),
      zipCode: form.zipCode.replace(/\D/g, ""),
    });
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Clientes Monitorados</h1>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo Cliente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl">Cadastrar Novo Cliente</DialogTitle>
              </DialogHeader>

              {/* SEÇÃO: EMPRESA RESPONSÁVEL */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mt-4">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-foreground">Empresa Responsável</h3>
                </div>
                <Separator />
                <div>
                  <Label className="text-sm font-medium">Empresa Parceira *</Label>
                  <Select onValueChange={(v) => setForm({ ...form, partnerCompanyId: Number(v) })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a empresa responsável..." /></SelectTrigger>
                    <SelectContent>
                      {partners.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* SEÇÃO: DADOS DO CLIENTE */}
                <div className="flex items-center gap-2 mt-6">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-foreground">Dados do Cliente</h3>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Tipo *</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "pf" | "pj", document: "" })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pf">Pessoa Física</SelectItem>
                        <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-medium">{form.type === "pf" ? "CPF *" : "CNPJ *"}</Label>
                    <Input
                      className="mt-1 font-mono"
                      placeholder={form.type === "pf" ? "000.000.000-00" : "00.000.000/0000-00"}
                      value={form.document}
                      onChange={(e) => setForm({ ...form, document: maskCpfCnpj(e.target.value, form.type) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">{form.type === "pf" ? "Nome Completo *" : "Razão Social *"}</Label>
                    <Input
                      className="mt-1"
                      placeholder={form.type === "pf" ? "Nome completo" : "Razão Social da empresa"}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Nome Fantasia</Label>
                    <Input
                      className="mt-1"
                      placeholder="Nome fantasia ou apelido"
                      value={form.fantasyName}
                      onChange={(e) => setForm({ ...form, fantasyName: e.target.value })}
                    />
                  </div>
                </div>

                {/* SEÇÃO: ENDEREÇO */}
                <div className="flex items-center gap-2 mt-6">
                  <MapPin className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-foreground">Endereço</h3>
                </div>
                <Separator />
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label className="text-sm font-medium">CEP</Label>
                    <div className="flex gap-1 mt-1">
                      <Input
                        className="font-mono"
                        placeholder="00000-000"
                        value={form.zipCode}
                        onChange={(e) => setForm({ ...form, zipCode: maskCep(e.target.value) })}
                        onBlur={() => buscarCep(form.zipCode)}
                      />
                    </div>
                    {loadingCep && <span className="text-xs text-primary">Buscando...</span>}
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-medium">Logradouro</Label>
                    <Input className="mt-1" placeholder="Rua, Avenida, etc." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Número</Label>
                    <Input className="mt-1" placeholder="Nº" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Complemento</Label>
                    <Input className="mt-1" placeholder="Apto, Sala, etc." value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Bairro</Label>
                    <Input className="mt-1" placeholder="Bairro" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Cidade</Label>
                    <Input className="mt-1" placeholder="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">UF</Label>
                    <Input className="mt-1" placeholder="UF" maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
                  </div>
                </div>

                {/* SEÇÃO: CONTATOS */}
                <div className="flex items-center gap-2 mt-6">
                  <Phone className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-foreground">Contatos</h3>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Telefone</Label>
                    <Input
                      className="mt-1 font-mono"
                      placeholder="(00) 00000-0000"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">WhatsApp</Label>
                    <Input
                      className="mt-1 font-mono"
                      placeholder="(00) 00000-0000"
                      value={form.whatsapp}
                      onChange={(e) => setForm({ ...form, whatsapp: maskPhone(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">E-mail</Label>
                    <Input
                      className="mt-1"
                      type="email"
                      placeholder="email@exemplo.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* BOTÕES */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => { setShowCreate(false); setForm({ ...INITIAL_FORM }); }}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending} className="min-w-[140px]">
                  {createMutation.isPending ? "Salvando..." : "Cadastrar Cliente"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* BUSCA */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, fantasia ou documento..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* LISTA DE CLIENTES */}
        <ScrollArea className="h-[calc(100vh-250px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((client: any) => (
              <Card key={client.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/clients/${client.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {client.type === "pj" ? <Building2 className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-primary" />}
                      <div className="min-w-0">
                        <h3 className="font-bold text-foreground truncate">{client.fantasyName || client.name}</h3>
                        {client.fantasyName && <p className="text-xs text-muted-foreground truncate">{client.name}</p>}
                      </div>
                    </div>
                    <Badge variant={client.isActive ? "default" : "destructive"} className="text-xs shrink-0">
                      {client.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className="font-mono text-xs">{client.type === "pf" ? "CPF" : "CNPJ"}: {client.document}</p>
                    {client.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{client.phone}</p>}
                    {client.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{client.email}</p>}
                    {client.city && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{client.neighborhood ? `${client.neighborhood}, ` : ""}{client.city}/{client.state}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredClients.length === 0 && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                Nenhum cliente encontrado
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </DashboardLayout>
  );
}
