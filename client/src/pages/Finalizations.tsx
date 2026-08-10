import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, Plus, CheckCircle, ListChecks } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Categorias de finalização
const CATEGORIAS = [
  { valor: "falso_alarme", nome: "Falso Alarme" },
  { valor: "confirmado", nome: "Alarme Confirmado" },
  { valor: "teste", nome: "Teste" },
  { valor: "tecnico", nome: "Problema Técnico" },
  { valor: "cliente", nome: "Ação do Cliente" },
  { valor: "tatico", nome: "Tático/Polícia" },
  { valor: "outros", nome: "Outros" },
];

export default function Finalizations() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    categoria: "falso_alarme",
    ativo: true,
  });

  // Usar a lista de finalizações do backend
  const { data: finalizacoes = [], refetch } = trpc.finalization.list.useQuery(undefined);
  const createMut = trpc.finalization.create.useMutation({ onSuccess: () => { refetch(); setModalOpen(false); toast.success("Finalização cadastrada!"); } });
  const updateMut = trpc.finalization.update.useMutation({ onSuccess: () => { refetch(); setModalOpen(false); toast.success("Finalização atualizada!"); } });
  const deleteMut = trpc.finalization.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Finalização excluída!"); } });

  function abrirNovo() {
    setEditando(null);
    setForm({ titulo: "", descricao: "", categoria: "falso_alarme", ativo: true });
    setModalOpen(true);
  }

  function abrirEditar(item: any) {
    setEditando(item);
    setForm({
      titulo: item.title || "",
      descricao: item.description || "",
      categoria: item.category || "falso_alarme",
      ativo: item.isActive !== false,
    });
    setModalOpen(true);
  }

  function salvar() {
    const payload = {
      title: form.titulo,
      description: form.descricao,
      category: form.categoria,
      isActive: form.ativo,
    };
    if (editando) {
      updateMut.mutate({ id: editando.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ListChecks className="h-6 w-6" /> Finalizações Automáticas
          </h1>
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Finalização
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Cadastre aqui os textos/motivos de finalização que o operador pode selecionar rapidamente ao finalizar uma ocorrência no dashboard.
        </p>

        {/* Tabela de Finalizações */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-muted-foreground text-xs font-bold">
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-left">Descrição</th>
                <th className="px-4 py-3 text-center">Categoria</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {finalizacoes.map((item: any) => (
                <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-bold text-foreground">{item.title}</td>
                  <td className="px-4 py-3 text-foreground max-w-[300px] truncate">{item.description || "-"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className="capitalize">{CATEGORIAS.find(c => c.valor === item.category)?.nome || item.category}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.isActive ? <Badge className="bg-green-500/20 text-green-400">Ativo</Badge> : <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => abrirEditar(item)} className="text-primary hover:text-primary/80 mr-2"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm("Excluir esta finalização?")) deleteMut.mutate({ id: item.id }); }} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {finalizacoes.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma finalização cadastrada. Clique em "+ Nova Finalização" para criar textos de finalização rápida.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar Finalização" : "Nova Finalização Automática"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Título (texto curto que aparece no botão)</Label>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Cliente confirmou falso alarme" />
              </div>
              <div>
                <Label>Descrição (texto completo salvo na ocorrência)</Label>
                <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Cliente contactado confirmou que foi falso alarme causado por animal doméstico." rows={3} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c.valor} value={c.valor}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button onClick={salvar} disabled={createMut.isPending || updateMut.isPending || !form.titulo}>Salvar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
