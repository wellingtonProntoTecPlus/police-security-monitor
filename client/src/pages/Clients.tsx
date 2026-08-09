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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, User, Building2, Phone, Mail, MapPin, ArrowLeft, Save, Trash2, Pencil } from "lucide-react";
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
  notes: "",
};

export default function Clients() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "create">("list");
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [loadingCep, setLoadingCep] = useState(false);

  const { data: clients = [], refetch } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: partners = [] } = trpc.partnerCompany.list.useQuery(undefined);
  const createMutation = trpc.monitoredClient.create.useMutation({
    onSuccess: () => {
      toast.success("Cliente cadastrado com sucesso!");
      setView("list");
      setForm({ ...INITIAL_FORM });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.monitoredClient.delete.useMutation({
    onSuccess: () => { toast.success("Cliente excluído!"); refetch(); },
    onError: (err) => toast.error("Erro ao excluir: " + err.message),
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

  // ===== VIEW: FORMULÁRIO DE CADASTRO =====
  if (view === "create") {
    return (
      <DashboardLayout>
        <div className="h-full overflow-auto">
          <div className="p-6 max-w-[1400px] mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <Button variant="ghost" size="sm" onClick={() => setView("list")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <h1 className="text-xl font-bold text-foreground">Cadastrar Novo Cliente</h1>
            </div>

            {/* Formulário em grid desktop */}
            <div className="grid grid-cols-12 gap-6">
              {/* COLUNA ESQUERDA: Dados Principais */}
              <div className="col-span-8 space-y-6">
                {/* Empresa Responsável */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Empresa Responsável</h3>
                    </div>
                    <Select onValueChange={(v) => setForm({ ...form, partnerCompanyId: Number(v) })}>
                      <SelectTrigger><SelectValue placeholder="Selecione a empresa parceira responsável por este cliente..." /></SelectTrigger>
                      <SelectContent>
                        {partners.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                {/* Dados do Cliente */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <User className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Dados do Cliente</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Tipo *</Label>
                        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "pf" | "pj", document: "" })}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pf">Pessoa Física</SelectItem>
                            <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4">
                        <Label className="text-sm font-medium">{form.type === "pf" ? "CPF *" : "CNPJ *"}</Label>
                        <Input
                          className="mt-1 font-mono"
                          placeholder={form.type === "pf" ? "000.000.000-00" : "00.000.000/0000-00"}
                          value={form.document}
                          onChange={(e) => setForm({ ...form, document: maskCpfCnpj(e.target.value, form.type) })}
                        />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-sm font-medium">{form.type === "pf" ? "Nome Completo *" : "Razão Social *"}</Label>
                        <Input
                          className="mt-1"
                          placeholder={form.type === "pf" ? "Nome completo" : "Razão Social da empresa"}
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-sm font-medium">Nome Fantasia</Label>
                        <Input
                          className="mt-1"
                          placeholder="Nome fantasia ou apelido"
                          value={form.fantasyName}
                          onChange={(e) => setForm({ ...form, fantasyName: e.target.value })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Endereço */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Endereço</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">CEP</Label>
                        <Input
                          className="mt-1 font-mono"
                          placeholder="00000-000"
                          value={form.zipCode}
                          onChange={(e) => setForm({ ...form, zipCode: maskCep(e.target.value) })}
                          onBlur={() => buscarCep(form.zipCode)}
                        />
                        {loadingCep && <span className="text-xs text-primary mt-1">Buscando CEP...</span>}
                      </div>
                      <div className="col-span-3">
                        <Label className="text-sm font-medium">Logradouro</Label>
                        <Input className="mt-1" placeholder="Rua, Avenida, Travessa..." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-sm font-medium">Número</Label>
                        <Input className="mt-1" placeholder="Nº" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Complemento</Label>
                        <Input className="mt-1" placeholder="Apto, Sala, Bloco..." value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Bairro</Label>
                        <Input className="mt-1" placeholder="Bairro" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-sm font-medium">Cidade</Label>
                        <Input className="mt-1" placeholder="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-sm font-medium">UF</Label>
                        <Input className="mt-1" placeholder="UF" maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* COLUNA DIREITA: Contatos + Observações */}
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
                  </CardContent>
                </Card>

                {/* Observações */}
                <Card>
                  <CardContent className="p-5">
                    <Label className="text-sm font-medium">Observações</Label>
                    <Textarea
                      className="mt-2 min-h-[100px]"
                      placeholder="Informações adicionais sobre o cliente..."
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </CardContent>
                </Card>

                {/* Botão Salvar */}
                <Button onClick={handleSubmit} disabled={createMutation.isPending} className="w-full h-12 text-base font-bold">
                  <Save className="h-5 w-5 mr-2" />
                  {createMutation.isPending ? "Salvando..." : "Cadastrar Cliente"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ===== VIEW: LISTA DE CLIENTES =====
  return (
    <DashboardLayout>
      <div className="h-full overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Clientes Monitorados</h1>
          <Button onClick={() => setView("create")}>
            <Plus className="h-4 w-4 mr-2" /> Novo Cliente
          </Button>
        </div>

        {/* BUSCA */}
        <div className="relative max-w-lg mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, fantasia ou documento..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* TABELA DE CLIENTES - Layout Desktop */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_140px_180px_140px_80px_80px] gap-4 px-6 py-3 bg-secondary/50 border-b border-border text-xs font-bold text-muted-foreground uppercase">
            <span>Razão Social / Nome</span>
            <span>Nome Fantasia</span>
            <span>CPF/CNPJ</span>
            <span>Telefone / WhatsApp</span>
            <span>Cidade/UF</span>
            <span>Status</span>
            <span>Ações</span>
          </div>
          {filteredClients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum cliente encontrado
            </div>
          ) : (
            filteredClients.map((client: any) => (
              <div
                key={client.id}
                className="grid grid-cols-[1fr_1fr_140px_180px_140px_80px_80px] gap-4 px-6 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer items-center"
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {client.type === "pj" ? <Building2 className="h-4 w-4 text-primary shrink-0" /> : <User className="h-4 w-4 text-primary shrink-0" />}
                  <span className="font-medium text-foreground truncate">{client.name}</span>
                </div>
                <span className="text-muted-foreground truncate">{client.fantasyName || "—"}</span>
                <span className="font-mono text-xs text-muted-foreground">{client.document}</span>
                <div className="text-xs text-muted-foreground">
                  {client.phone && <span className="block">{client.phone}</span>}
                  {client.whatsapp && <span className="block text-green-400">{client.whatsapp}</span>}
                </div>
                <span className="text-xs text-muted-foreground">{client.city ? `${client.city}/${client.state}` : "—"}</span>
                <Badge variant={client.isActive ? "default" : "destructive"} className="text-xs justify-center">
                  {client.isActive ? "Ativo" : "Inativo"}
                </Badge>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(`/clients/${client.id}`)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => {
                    if (confirm("Excluir este cliente permanentemente?")) {
                      deleteMut.mutate({ id: client.id });
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
    </DashboardLayout>
  );
}
