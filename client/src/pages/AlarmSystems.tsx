import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Shield, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

const BRANDS = ["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"] as const;

const INITIAL_FORM = {
  clientId: 0,
  account: "",
  brand: "" as string,
  model: "",
  version: "",
  receiverIp: "",
};

export default function AlarmSystems() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "create">("list");
  const [form, setForm] = useState({ ...INITIAL_FORM });

  const { data: systems = [], refetch } = trpc.alarmSystem.list.useQuery(undefined);
  const { data: clients = [] } = trpc.monitoredClient.list.useQuery(undefined);
  const createMutation = trpc.alarmSystem.create.useMutation({
    onSuccess: () => {
      toast.success("Sistema de alarme cadastrado!");
      setView("list");
      setForm({ ...INITIAL_FORM });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredSystems = systems.filter((s: any) =>
    s.account.includes(search) || s.brand.toLowerCase().includes(search.toLowerCase())
  );

  function handleSubmit() {
    if (!form.clientId) { toast.error("Selecione o cliente"); return; }
    if (!form.account.trim()) { toast.error("Informe a conta Contact ID"); return; }
    if (!form.brand) { toast.error("Selecione a marca"); return; }
    createMutation.mutate(form as any);
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
              <h1 className="text-xl font-bold text-foreground">Cadastrar Sistema de Alarme</h1>
            </div>

            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-8">
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Shield className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">Dados do Sistema</h3>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      <div className="col-span-6">
                        <Label className="text-sm font-medium">Cliente *</Label>
                        <Select onValueChange={(v) => setForm({ ...form, clientId: Number(v) })}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
                          <SelectContent>
                            {clients.map((c: any) => (
                              <SelectItem key={c.id} value={String(c.id)}>{c.fantasyName || c.name} — {c.document}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Conta Contact ID *</Label>
                        <Input className="mt-1 font-mono" placeholder="0000" maxLength={4} value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Marca *</Label>
                        <Select onValueChange={(v) => setForm({ ...form, brand: v })}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Marca" /></SelectTrigger>
                          <SelectContent>
                            {BRANDS.map((b) => (
                              <SelectItem key={b} value={b}>{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Modelo</Label>
                        <Input className="mt-1" placeholder="Ex: Active 20" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-sm font-medium">Versão/Firmware</Label>
                        <Input className="mt-1" placeholder="Ex: v3.2.1" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-sm font-medium">IP do Receptor</Label>
                        <Input className="mt-1 font-mono" placeholder="192.168.0.100" value={form.receiverIp} onChange={(e) => setForm({ ...form, receiverIp: e.target.value })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="col-span-4">
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
          <div className="grid grid-cols-[80px_120px_1fr_120px_140px_80px] gap-4 px-6 py-3 bg-secondary/50 border-b border-border text-xs font-bold text-muted-foreground uppercase">
            <span>Conta</span>
            <span>Marca</span>
            <span>Modelo</span>
            <span>Versão</span>
            <span>IP Receptor</span>
            <span>Status</span>
          </div>
          {filteredSystems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum sistema de alarme encontrado</div>
          ) : (
            filteredSystems.map((sys: any) => (
              <div key={sys.id} className="grid grid-cols-[80px_120px_1fr_120px_140px_80px] gap-4 px-6 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors items-center">
                <span className="font-mono font-bold text-foreground">{sys.account}</span>
                <Badge variant="outline" className="text-xs justify-center">{sys.brand}</Badge>
                <span className="text-sm text-foreground">{sys.model || "—"}</span>
                <span className="text-xs text-muted-foreground">{sys.version || "—"}</span>
                <span className="font-mono text-xs text-muted-foreground">{sys.receiverIp || "—"}</span>
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
