import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Trash2, Plus, Globe } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const FABRICANTES = ["COMPATEC", "VETTI", "JFL", "INTELBRAS", "RADIOENGE", "VIAWEB"];

const CORES = [
  { valor: "#EF4444", nome: "Vermelho (Alarme)" },
  { valor: "#F59E0B", nome: "Amarelo (Técnico)" },
  { valor: "#10B981", nome: "Verde (Arme)" },
  { valor: "#F97316", nome: "Laranja (Desarme)" },
  { valor: "#3B82F6", nome: "Azul (Info)" },
  { valor: "#8B5CF6", nome: "Roxo (Sistema)" },
  { valor: "#6B7280", nome: "Cinza (Teste)" },
];

const TIPOS = [
  { valor: "alarme", nome: "Alarme (Urgente)" },
  { valor: "tecnico", nome: "Técnico (Falha)" },
  { valor: "arme", nome: "Arme" },
  { valor: "desarme", nome: "Desarme" },
  { valor: "restauracao", nome: "Restauração" },
  { valor: "teste", nome: "Teste" },
  { valor: "sistema", nome: "Sistema" },
];

export default function ContactId() {
  const [fabricante, setFabricante] = useState("COMPATEC");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form, setForm] = useState({
    codigo: "",
    qualifier: "E",
    fabricante: "COMPATEC",
    isUniversal: false,
    descricao: "",
    tipo: "alarme",
    cor: "#EF4444",
    abreTela: true,
    fechaAutomatico: false,
    fechaComRestauracao: false,
    codigoRestauracao: "",
    tempoEsperaSegundos: 0,
    prioridade: 1,
  });

  const { data: eventos, refetch } = trpc.contactId.listByFabricante.useQuery({ fabricante });
  const createMut = trpc.contactId.create.useMutation({ onSuccess: () => { refetch(); setModalOpen(false); toast.success("Evento cadastrado!"); } });
  const updateMut = trpc.contactId.update.useMutation({ onSuccess: () => { refetch(); setModalOpen(false); toast.success("Evento atualizado!"); } });
  const deleteMut = trpc.contactId.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Evento excluído!"); } });

  function abrirNovo() {
    setEditando(null);
    setForm({ codigo: "", qualifier: "E", fabricante, isUniversal: false, descricao: "", tipo: "alarme", cor: "#EF4444", abreTela: true, fechaAutomatico: false, fechaComRestauracao: false, codigoRestauracao: "", tempoEsperaSegundos: 0, prioridade: 1 });
    setModalOpen(true);
  }

  function abrirEditar(ev: any) {
    setEditando(ev);
    setForm({
      codigo: ev.code || "",
      qualifier: ev.qualifier || "E",
      fabricante: ev.fabricante || fabricante,
      isUniversal: ev.isUniversal || false,
      descricao: ev.description || "",
      tipo: ev.tipo || "alarme",
      cor: ev.cor || "#EF4444",
      abreTela: ev.abreTela === 1,
      fechaAutomatico: ev.fechaAutomatico === 1,
      fechaComRestauracao: ev.fechaComRestauracao === 1,
      codigoRestauracao: ev.codigoRestauracao || "",
      tempoEsperaSegundos: ev.tempoEsperaSegundos || 0,
      prioridade: ev.prioridade || 1,
    });
    setModalOpen(true);
  }

  function salvar() {
    const payload = {
      code: form.codigo,
      qualifier: form.qualifier,
      fabricante: form.fabricante,
      isUniversal: form.isUniversal,
      description: form.descricao,
      tipo: form.tipo,
      cor: form.cor,
      abreTela: form.abreTela ? 1 : 0,
      fechaAutomatico: form.fechaAutomatico ? 1 : 0,
      fechaComRestauracao: form.fechaComRestauracao ? 1 : 0,
      codigoRestauracao: form.codigoRestauracao,
      tempoEsperaSegundos: form.tempoEsperaSegundos,
      prioridade: form.prioridade,
    };
    if (editando) {
      updateMut.mutate({ id: editando.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  // Separar códigos universais dos específicos do fabricante
  const universalCodes = (eventos || []).filter((ev: any) => ev.isUniversal);
  const fabricanteCodes = (eventos || []).filter((ev: any) => !ev.isUniversal);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Tabela Contact ID</h1>
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Evento
          </Button>
        </div>

        {/* Abas por fabricante */}
        <Tabs value={fabricante} onValueChange={setFabricante}>
          <TabsList className="bg-muted">
            {FABRICANTES.map((f) => (
              <TabsTrigger key={f} value={f} className="text-xs font-bold">{f}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Seção de Códigos Universais */}
        {universalCodes.length > 0 && (
          <div className="border border-blue-500/30 rounded-lg overflow-hidden">
            <div className="bg-blue-500/10 px-4 py-2 flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-400">Códigos Universais (aparecem em todas as abas)</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-muted-foreground text-xs font-bold">
                  <th className="px-4 py-2 text-left">Qualifier</th>
                  <th className="px-4 py-2 text-left">Código</th>
                  <th className="px-4 py-2 text-left">Descrição</th>
                  <th className="px-4 py-2 text-center">Cor</th>
                  <th className="px-4 py-2 text-center">Tipo</th>
                  <th className="px-4 py-2 text-center">Prioridade</th>
                  <th className="px-4 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {universalCodes.map((ev: any) => (
                  <tr key={ev.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <Badge className={ev.qualifier === 'E' ? 'bg-orange-500/20 text-orange-400' : ev.qualifier === 'R' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                        {ev.qualifier === 'E' ? 'E (Evento)' : ev.qualifier === 'R' ? 'R (Restauro)' : 'Ambos'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 font-bold text-foreground">{ev.qualifier}{ev.code}</td>
                    <td className="px-4 py-2 text-foreground">{ev.description}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="w-5 h-5 rounded-full mx-auto" style={{ backgroundColor: ev.cor }} />
                    </td>
                    <td className="px-4 py-2 text-center text-muted-foreground capitalize">{ev.tipo}</td>
                    <td className="px-4 py-2 text-center text-foreground font-bold">{ev.prioridade}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => abrirEditar(ev)} className="text-primary hover:text-primary/80 mr-2"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => { if (confirm("Excluir este evento universal?")) deleteMut.mutate({ id: ev.id }); }} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabela de Códigos do Fabricante */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-4 py-2">
            <span className="text-sm font-bold text-foreground">Códigos {fabricante}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-muted-foreground text-xs font-bold">
                <th className="px-4 py-3 text-left">Qualifier</th>
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Descrição</th>
                <th className="px-4 py-3 text-center">Cor</th>
                <th className="px-4 py-3 text-center">Abre Tela</th>
                <th className="px-4 py-3 text-center">Fecha Auto</th>
                <th className="px-4 py-3 text-center">Fecha c/ Rest.</th>
                <th className="px-4 py-3 text-center">Espera (s)</th>
                <th className="px-4 py-3 text-center">Prioridade</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {fabricanteCodes.map((ev: any) => (
                <tr key={ev.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Badge className={ev.qualifier === 'E' ? 'bg-orange-500/20 text-orange-400' : ev.qualifier === 'R' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                      {ev.qualifier === 'E' ? 'E' : ev.qualifier === 'R' ? 'R' : 'E/R'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-bold text-foreground">{ev.qualifier}{ev.code}</td>
                  <td className="px-4 py-3 text-foreground">{ev.description}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="w-5 h-5 rounded-full mx-auto" style={{ backgroundColor: ev.cor }} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ev.abreTela ? <Badge className="bg-green-500/20 text-green-400">SIM</Badge> : <Badge variant="outline">NÃO</Badge>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ev.fechaAutomatico ? <Badge className="bg-yellow-500/20 text-yellow-400">SIM</Badge> : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ev.fechaComRestauracao ? <Badge className="bg-blue-500/20 text-blue-400">SIM</Badge> : "-"}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{ev.tempoEsperaSegundos || "-"}</td>
                  <td className="px-4 py-3 text-center text-foreground font-bold">{ev.prioridade}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => abrirEditar(ev)} className="text-primary hover:text-primary/80 mr-2"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm("Excluir este evento?")) deleteMut.mutate({ id: ev.id }); }} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {fabricanteCodes.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Nenhum evento específico cadastrado para {fabricante}. Clique em "+ Novo Evento" para começar.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal de Criação/Edição */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar Evento" : "Novo Evento Contact ID"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Código (ex: 130, 401)</Label>
                  <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                </div>
                <div>
                  <Label>Qualifier</Label>
                  <Select value={form.qualifier} onValueChange={(v) => setForm({ ...form, qualifier: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="E">E (Evento/Desarme)</SelectItem>
                      <SelectItem value="R">R (Restauro/Arme)</SelectItem>
                      <SelectItem value="both">Ambos (E/R)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fabricante</Label>
                  <Select value={form.fabricante} onValueChange={(v) => setForm({ ...form, fabricante: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNIVERSAL">UNIVERSAL</SelectItem>
                      {FABRICANTES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prioridade (1-5)</Label>
                  <Input type="number" min={1} max={5} value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: Number(e.target.value) })} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={form.isUniversal} onCheckedChange={(v) => setForm({ ...form, isUniversal: v, fabricante: v ? 'UNIVERSAL' : fabricante })} />
                <Label className="text-sm">Código Universal (aparece em todas as abas de fabricantes)</Label>
              </div>

              <div>
                <Label>Descrição do Evento</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cor</Label>
                  <Select value={form.cor} onValueChange={(v) => setForm({ ...form, cor: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CORES.map((c) => (
                        <SelectItem key={c.valor} value={c.valor}>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.valor }} />
                            {c.nome}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border border-border rounded-lg p-4 space-y-3">
                <p className="text-sm font-bold text-primary">Comportamento:</p>
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.abreTela} onCheckedChange={(v) => setForm({ ...form, abreTela: v })} />
                    <Label className="text-sm">Abre na tela do operador</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.fechaAutomatico} onCheckedChange={(v) => setForm({ ...form, fechaAutomatico: v })} />
                    <Label className="text-sm">Fecha automaticamente</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.fechaComRestauracao} onCheckedChange={(v) => setForm({ ...form, fechaComRestauracao: v })} />
                    <Label className="text-sm">Fecha com restauração</Label>
                  </div>
                </div>

                {form.fechaComRestauracao && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <Label>Código de Restauração</Label>
                      <Input value={form.codigoRestauracao} onChange={(e) => setForm({ ...form, codigoRestauracao: e.target.value })} placeholder="ex: 3384 restaura 1384" />
                    </div>
                    <div>
                      <Label>Tempo de espera (segundos)</Label>
                      <Input type="number" value={form.tempoEsperaSegundos} onChange={(e) => setForm({ ...form, tempoEsperaSegundos: Number(e.target.value) })} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button onClick={salvar} disabled={createMut.isPending || updateMut.isPending}>Salvar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
