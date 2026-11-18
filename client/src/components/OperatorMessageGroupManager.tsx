import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Archive, Plus, Save, Users, X } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = { admin: "Administrador", supervisor: "Supervisor", operator: "Operador" };

export default function OperatorMessageGroupManager() {
  const { user } = useAuth();
  const canManage = user && ["admin", "supervisor"].includes(user.role);
  const groups = trpc.operatorShift.managedMessageGroups.useQuery(undefined, { enabled: Boolean(canManage), retry: false });
  const users = trpc.operatorShift.messageGroupUsers.useQuery(undefined, { enabled: Boolean(canManage), retry: false });
  const utils = trpc.useUtils();
  const [groupId, setGroupId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const save = trpc.operatorShift.saveMessageGroup.useMutation({
    onSuccess: async () => {
      toast.success(groupId ? "Grupo atualizado." : "Grupo criado.");
      setGroupId(null); setName(""); setMemberIds([]);
      await Promise.all([utils.operatorShift.managedMessageGroups.invalidate(), utils.operatorShift.messageGroups.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setIsSaving(false),
  });
  const deactivate = trpc.operatorShift.deactivateMessageGroup.useMutation({
    onSuccess: async () => {
      toast.success("Grupo desativado. O histórico de mensagens foi preservado.");
      await Promise.all([utils.operatorShift.managedMessageGroups.invalidate(), utils.operatorShift.messageGroups.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });
  if (!canManage) return null;

  const beginEdit = (group: { id: number; name: string; members: Array<{ userId: number }> }) => {
    setGroupId(Number(group.id)); setName(group.name); setMemberIds(group.members.map((member) => Number(member.userId)));
  };
  const toggleMember = (userId: number) => setMemberIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  const submit = () => {
    if (name.trim().length < 2) { toast.error("Informe um nome de grupo com pelo menos 2 caracteres."); return; }
    setIsSaving(true);
    save.mutate({ ...(groupId ? { groupId } : {}), name: name.trim(), memberUserIds: memberIds });
  };

  return <Card aria-label="Administração de grupos de mensagens">
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Grupos de mensagens</CardTitle>
      <p className="text-xs text-muted-foreground">Crie grupos e escolha quem pode enviar e receber recados. Inclusões, remoções e alterações ficam auditadas; mensagens e recibos já enviados são preservados.</p>
    </CardHeader>
    <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="space-y-3 rounded-lg border border-border p-4" aria-label={groupId ? "Editar grupo" : "Criar grupo"}>
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{groupId ? "Editar grupo" : "Novo grupo"}</h3>{groupId ? <Button variant="ghost" size="sm" onClick={() => { setGroupId(null); setName(""); setMemberIds([]); }}><X className="mr-1 h-4 w-4" />Cancelar edição</Button> : null}</div>
        <label className="block text-sm">Nome do grupo
          <input aria-label="Nome do grupo de mensagens" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-foreground" placeholder="Ex.: Operadoras da noite" />
        </label>
        <fieldset className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
          <legend className="px-1 text-sm">Participantes</legend>
          {users.isLoading ? <p className="text-xs text-muted-foreground">Carregando equipe...</p> : null}
          {users.error ? <p role="alert" className="text-sm text-destructive">{users.error.message}</p> : null}
          {users.data?.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-muted/40">
            <input type="checkbox" aria-label={`Incluir ${person.name || `Usuário ${person.id}`} no grupo`} checked={memberIds.includes(Number(person.id))} onChange={() => toggleMember(Number(person.id))} />
            <span>{person.name || `Usuário ${person.id}`} <span className="text-xs text-muted-foreground">· {ROLE_LABELS[person.role] || person.role}</span></span>
          </label>)}
          {!users.isLoading && !users.error && !users.data?.length ? <p className="text-xs text-muted-foreground">Nenhum usuário operacional disponível.</p> : null}
        </fieldset>
        <p className="text-xs text-muted-foreground">{memberIds.length} participante(s) selecionado(s). Quem for removido não receberá novas mensagens; mensagens já entregues permanecem no histórico individual.</p>
        <Button className="w-full" disabled={isSaving || save.isPending || !name.trim() || (!groupId && !memberIds.length) || Boolean(users.error)} onClick={submit}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Salvando..." : groupId ? "Salvar alterações" : <><Plus className="mr-1 h-4 w-4" />Criar grupo</>}</Button>
      </section>

      <section className="space-y-3" aria-label="Grupos cadastrados">
        <h3 className="font-semibold">Grupos cadastrados</h3>
        {groups.isLoading ? <p className="text-sm text-muted-foreground">Carregando grupos...</p> : null}
        {groups.error ? <p role="alert" className="text-sm text-destructive">{groups.error.message}</p> : null}
        {groups.data?.map((group) => <article key={group.id} className={`rounded-lg border p-3 ${group.isActive ? "border-border" : "border-border/50 opacity-70"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-semibold">{group.name}{!group.isActive ? <span className="ml-2 text-xs text-muted-foreground">(inativo)</span> : null}</p>
              <p className="mt-1 text-xs text-muted-foreground">{group.members.length} participante(s){group.members.length ? `: ${group.members.map((member: { userId: number; name: string | null }) => member.name || `Usuário ${member.userId}`).join(", ")}` : ""}</p>
            </div>
            {group.isActive ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => beginEdit(group)}>Editar</Button><Button size="sm" variant="outline" className="text-amber-200" disabled={deactivate.isPending} onClick={() => { if (window.confirm(`Desativar o grupo ${group.name}? As mensagens já enviadas serão preservadas.`)) deactivate.mutate({ groupId: Number(group.id) }); }}><Archive className="mr-1 h-3.5 w-3.5" />Desativar</Button></div> : null}
          </div>
        </article>)}
        {!groups.isLoading && !groups.error && !groups.data?.length ? <p className="rounded border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum grupo cadastrado.</p> : null}
      </section>
    </CardContent>
  </Card>;
}
