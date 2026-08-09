import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ManagingCompany() {
  const { data: companies = [], refetch } = trpc.managingCompany.list.useQuery(undefined);
  const createMut = trpc.managingCompany.create.useMutation({ onSuccess: () => { refetch(); toast.success("Empresa salva!"); } });
  const updateMut = trpc.managingCompany.update.useMutation({ onSuccess: () => { refetch(); toast.success("Empresa atualizada!"); } });

  const company = companies[0]; // Só existe uma gestora

  const [form, setForm] = useState({
    name: company?.name || "",
    cnpj: company?.cnpj || "",
    phone: company?.phone || "",
    email: company?.email || "",
    address: company?.address || "",
    city: company?.city || "",
    state: company?.state || "",
  });

  // Atualizar form quando dados carregam
  useState(() => {
    if (company) {
      setForm({
        name: company.name || "",
        cnpj: company.cnpj || "",
        phone: company.phone || "",
        email: company.email || "",
        address: company.address || "",
        city: company.city || "",
        state: company.state || "",
      });
    }
  });

  const handleCepSearch = async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setForm(prev => ({ ...prev, address: data.logradouro || "", city: data.localidade || "", state: data.uf || "" }));
        }
      } catch {}
    }
  };

  const handleSave = () => {
    if (!form.name || !form.cnpj) { toast.error("Nome e CNPJ são obrigatórios"); return; }
    if (company) {
      updateMut.mutate({ id: company.id, ...form });
    } else {
      createMut.mutate(form);
    }
  };

  const isLoading = createMut.isPending || updateMut.isPending;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto overflow-auto h-full">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Empresa Gestora</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados da Empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Razão Social *</Label>
                <Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Police Security Ltda" />
              </div>
              <div>
                <Label>CNPJ *</Label>
                <Input value={form.cnpj} onChange={(e) => setForm(prev => ({ ...prev, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="(00) 0000-0000" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} placeholder="contato@empresa.com" />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="Rua, Av..." />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={form.city} onChange={(e) => setForm(prev => ({ ...prev, city: e.target.value }))} />
              </div>
              <div>
                <Label>UF</Label>
                <Input value={form.state} onChange={(e) => setForm(prev => ({ ...prev, state: e.target.value }))} maxLength={2} />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={handleSave} disabled={isLoading} className="gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {company ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
