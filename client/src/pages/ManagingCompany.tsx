import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Save, Loader2, Upload, Calendar, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { maskPhone, maskCnpj } from "@/lib/masks";

export default function ManagingCompany() {
  const { data: companies = [], refetch } = trpc.managingCompany.list.useQuery(undefined);
  const createMut = trpc.managingCompany.create.useMutation({ onSuccess: () => { refetch(); toast.success("Empresa salva!"); }, onError: (err) => toast.error(`Erro ao salvar: ${err.message}`) });
  const updateMut = trpc.managingCompany.update.useMutation({ onSuccess: () => { refetch(); toast.success("Empresa atualizada!"); }, onError: (err) => toast.error(`Erro ao atualizar: ${err.message}`) });

  const company = companies[0]; // Só existe uma gestora

  // Feriados
  const { data: holidays = [], refetch: refetchHolidays } = trpc.managingHoliday.list.useQuery(
    { managingCompanyId: company?.id || 0 },
    { enabled: !!company?.id }
  );
  const createHolidayMut = trpc.managingHoliday.create.useMutation({ onSuccess: () => { refetchHolidays(); setHolidayName(""); setHolidayDate(""); toast.success("Feriado adicionado!"); } });
  const deleteHolidayMut = trpc.managingHoliday.delete.useMutation({ onSuccess: () => { refetchHolidays(); toast.success("Feriado removido!"); } });
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");

  const [form, setForm] = useState({
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
  });

  // Atualizar form quando dados carregam
  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || "",
        cnpj: company.cnpj || "",
        phone: company.phone || "",
        whatsapp: company.whatsapp || "",
        email: company.email || "",
        zipCode: company.zipCode || "",
        address: company.address || "",
        city: company.city || "",
        state: company.state || "",
        logoUrl: company.logoUrl || "",
      });
    }
  }, [company]);

  const handleCepSearch = async (cep: string) => {
    const clean = cep.replace(/\D/g, "").slice(0, 8);
    const masked = clean.length <= 5 ? clean : `${clean.slice(0, 5)}-${clean.slice(5)}`;
    setForm(prev => ({ ...prev, zipCode: masked }));
    if (clean.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setForm(prev => ({
            ...prev,
            address: data.logradouro || "",
            city: data.localidade || "",
            state: data.uf || "",
          }));
          toast.success("Endereço encontrado!");
        } else {
          toast.error("CEP não encontrado");
        }
      } catch {
        toast.error("Erro ao buscar CEP");
      }
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
            {/* Logo */}
            <div>
              <Label>Logo da Empresa</Label>
              <div className="flex items-center gap-4 mt-1">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="Logo" className="h-16 w-auto rounded border border-border bg-black/20 p-1" />
                ) : (
                  <div className="h-16 w-16 rounded border border-dashed border-border flex items-center justify-center bg-secondary/30">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <Input
                  value={form.logoUrl}
                  onChange={(e) => setForm(prev => ({ ...prev, logoUrl: e.target.value }))}
                  placeholder="URL do logo (ex: https://...)"
                  className="flex-1"
                />
              </div>
            </div>

            {/* Dados principais */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Razão Social *</Label>
                <Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Police Security Ltda" />
              </div>
              <div>
                <Label>CNPJ *</Label>
                <Input value={form.cnpj} onChange={(e) => setForm(prev => ({ ...prev, cnpj: maskCnpj(e.target.value) }))} placeholder="00.000.000/0001-00" />
              </div>
            </div>

            {/* Contatos */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: maskPhone(e.target.value) }))} placeholder="(00) 0000-0000" />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={(e) => setForm(prev => ({ ...prev, whatsapp: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} placeholder="contato@empresa.com" />
              </div>
            </div>

            {/* Endereço com busca por CEP */}
            <div className="grid grid-cols-5 gap-4">
              <div>
                <Label>CEP</Label>
                <Input value={form.zipCode} onChange={(e) => handleCepSearch(e.target.value)} placeholder="00000-000" />
              </div>
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

        {/* Feriados */}
        {company && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Calendar className="h-5 w-5" /> Feriados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input placeholder="Nome do feriado" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} className="flex-1" />
                <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className="w-[160px]" />
                <Button size="sm" onClick={() => {
                  if (!holidayName || !holidayDate) { toast.error("Preencha nome e data"); return; }
                  createHolidayMut.mutate({ managingCompanyId: company.id, name: holidayName, date: holidayDate });
                }}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
              </div>
              <div className="space-y-2 max-h-[250px] overflow-auto">
                {holidays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum feriado cadastrado</p>
                ) : (
                  holidays.map((h: any) => (
                    <div key={h.id} className="flex items-center justify-between bg-secondary/30 rounded px-4 py-2">
                      <div>
                        <span className="font-medium">{h.name}</span>
                        <span className="text-sm text-muted-foreground ml-3">{h.date}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => deleteHolidayMut.mutate({ id: h.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
