import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Building2, Phone, Mail, MapPin, ArrowLeft, Save } from "lucide-react";
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

const INITIAL_FORM = {
  managingCompanyId: 1,
  name: "",
  cnpj: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
};

export default function Partners() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "create">("list");
  const [form, setForm] = useState({ ...INITIAL_FORM });

  const { data: partners = [], refetch } = trpc.partnerCompany.list.useQuery(undefined);
  const createMutation = trpc.partnerCompany.create.useMutation({
    onSuccess: () => {
      toast.success("Empresa parceira cadastrada!");
      setView("list");
      setForm({ ...INITIAL_FORM });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredPartners = partners.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.cnpj.includes(search.replace(/\D/g, ""))
  );

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Informe a Razão Social"); return; }
    if (!form.cnpj.trim()) { toast.error("Informe o CNPJ"); return; }
    createMutation.mutate({
      ...form,
      cnpj: form.cnpj.replace(/\D/g, ""),
      phone: form.phone.replace(/\D/g, ""),
    });
  }

  // ===== VIEW: FORMULÁRIO =====
  if (view === "create") {
    return (
      <DashboardLayout>
        <div className="h-full overflow-auto">
          <div className="p-6 max-w-[1200px] mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <Button variant="ghost" size="sm" onClick={() => setView("list")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <h1 className="text-xl font-bold text-foreground">Cadastrar Empresa Parceira</h1>
            </div>

            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-8 space-y-6">
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Dados da Empresa</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-4">
                        <Label className="text-sm font-medium">Razão Social *</Label>
                        <Input className="mt-1" placeholder="Razão Social da empresa" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">CNPJ *</Label>
                        <Input className="mt-1 font-mono" placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Endereço</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-4">
                        <Label className="text-sm font-medium">Endereço</Label>
                        <Input className="mt-1" placeholder="Logradouro completo" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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

              <div className="col-span-4 space-y-6">
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
                        <Label className="text-sm font-medium">E-mail</Label>
                        <Input className="mt-1" type="email" placeholder="email@empresa.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={handleSubmit} disabled={createMutation.isPending} className="w-full h-12 text-base font-bold">
                  <Save className="h-5 w-5 mr-2" />
                  {createMutation.isPending ? "Salvando..." : "Cadastrar Parceira"}
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
          <Button onClick={() => setView("create")}>
            <Plus className="h-4 w-4 mr-2" /> Nova Parceira
          </Button>
        </div>

        <div className="relative max-w-lg mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CNPJ..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_160px_180px_200px_100px] gap-4 px-6 py-3 bg-secondary/50 border-b border-border text-xs font-bold text-muted-foreground uppercase">
            <span>Razão Social</span>
            <span>CNPJ</span>
            <span>Telefone</span>
            <span>Cidade/UF</span>
            <span>Status</span>
          </div>
          {filteredPartners.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhuma empresa parceira encontrada</div>
          ) : (
            filteredPartners.map((partner: any) => (
              <div key={partner.id} className="grid grid-cols-[1fr_160px_180px_200px_100px] gap-4 px-6 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors items-center">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium text-foreground truncate">{partner.name}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{partner.cnpj}</span>
                <span className="text-sm text-muted-foreground">{partner.phone || "—"}</span>
                <span className="text-sm text-muted-foreground">{partner.city ? `${partner.city}/${partner.state}` : "—"}</span>
                <Badge variant={partner.isActive ? "default" : "destructive"} className="text-xs justify-center">
                  {partner.isActive ? "Ativa" : "Inativa"}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
