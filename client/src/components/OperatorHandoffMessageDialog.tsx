import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { toast } from "sonner";

export default function OperatorHandoffMessageDialog({ onClose }: { onClose: () => void }) {
  const [recipientType, setRecipientType] = useState<"operator" | "group">("operator");
  const [toUserId, setToUserId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [message, setMessage] = useState("");
  const recipients = trpc.operatorShift.recipients.useQuery(undefined, { retry: false });
  const groups = trpc.operatorShift.messageGroups.useQuery(undefined, { retry: false });
  const send = trpc.operatorShift.sendMessage.useMutation({
    onSuccess: () => { toast.success("Mensagem individual registrada."); onClose(); },
    onError: (error) => toast.error(error.message),
  });
  const sendGroup = trpc.operatorShift.sendGroupMessage.useMutation({
    onSuccess: (result) => { toast.success(`Mensagem enviada ao grupo (${result.recipientCount} destinatários).`); onClose(); },
    onError: (error) => toast.error(error.message),
  });
  const sending = send.isPending || sendGroup.isPending;
  return <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Escrever mensagem de passagem de turno">
    <div className="w-full max-w-lg rounded-xl border border-primary/40 bg-card text-card-foreground shadow-2xl">
      <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Mensagem para operador ou grupo</h2><p className="mt-1 text-xs text-muted-foreground">Recado interno auditado. Não cria ocorrência, não envia comando e não modifica a agenda do cliente.</p></div>
      <div className="space-y-4 p-5">
        <div role="tablist" aria-label="Destinatário da mensagem" className="grid grid-cols-2 gap-2">
          <Button type="button" role="tab" aria-selected={recipientType === "operator"} variant={recipientType === "operator" ? "default" : "outline"} onClick={() => setRecipientType("operator")}>Uma pessoa</Button>
          <Button type="button" role="tab" aria-selected={recipientType === "group"} variant={recipientType === "group" ? "default" : "outline"} onClick={() => setRecipientType("group")}>Um grupo</Button>
        </div>
        {recipientType === "operator" ? <label className="block text-sm">Destinatário
          <select value={toUserId} onChange={(event) => setToUserId(event.target.value)} className="mt-1 h-10 w-full rounded border border-input bg-background px-3 text-foreground" aria-label="Destinatário da mensagem">
            <option value="">Selecione o operador</option>{recipients.data?.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label> : <label className="block text-sm">Grupo
          <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="mt-1 h-10 w-full rounded border border-input bg-background px-3 text-foreground" aria-label="Grupo destinatário da mensagem">
            <option value="">Selecione o grupo</option>{groups.data?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          {groups.isLoading ? <span className="mt-1 block text-xs text-muted-foreground">Carregando grupos...</span> : null}
          {groups.error ? <span role="alert" className="mt-1 block text-xs text-destructive">{groups.error.message}</span> : null}
          {!groups.isLoading && !groups.error && !groups.data?.length ? <span className="mt-1 block text-xs text-muted-foreground">Você ainda não participa de grupos ativos.</span> : null}
        </label>}
        <label className="block text-sm">Mensagem
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={4000} className="mt-1 w-full rounded border border-input bg-background p-3 text-foreground" placeholder="Ex.: Sra. Fernanda pediu fechamento às 23h. Ajuste a exceção da agenda da conta e confirme." />
        </label>
        {recipients.error ? <p className="text-sm text-destructive">{recipients.error.message}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-4"><Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button><Button disabled={sending || (recipientType === "operator" ? !toUserId || Boolean(recipients.error) : !groupId || Boolean(groups.error) || !groups.data?.length) || message.trim().length < 10} onClick={() => recipientType === "operator" ? send.mutate({ toUserId: Number(toUserId), message }) : sendGroup.mutate({ groupId: Number(groupId), message })}>{sending ? "Registrando..." : "Enviar mensagem"}</Button></div>
    </div>
  </div>;
}
