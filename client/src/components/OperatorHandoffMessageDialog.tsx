import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { toast } from "sonner";

export default function OperatorHandoffMessageDialog({ onClose }: { onClose: () => void }) {
  const [toUserId, setToUserId] = useState("");
  const [message, setMessage] = useState("");
  const recipients = trpc.operatorShift.recipients.useQuery(undefined, { retry: false });
  const send = trpc.operatorShift.sendMessage.useMutation({
    onSuccess: () => { toast.success("Mensagem registrada para o próximo operador."); onClose(); },
    onError: (error) => toast.error(error.message),
  });
  return <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Escrever mensagem de passagem de turno">
    <div className="w-full max-w-lg rounded-xl border border-primary/40 bg-card text-card-foreground shadow-2xl">
      <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Mensagem para o próximo operador</h2><p className="mt-1 text-xs text-muted-foreground">Recado interno auditado. Não cria ocorrência, não envia comando e não modifica a agenda do cliente.</p></div>
      <div className="space-y-4 p-5">
        <label className="block text-sm">Destinatário
          <select value={toUserId} onChange={(event) => setToUserId(event.target.value)} className="mt-1 h-10 w-full rounded border border-input bg-background px-3 text-foreground" aria-label="Destinatário da mensagem">
            <option value="">Selecione o operador</option>{recipients.data?.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">Mensagem
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={4000} className="mt-1 w-full rounded border border-input bg-background p-3 text-foreground" placeholder="Ex.: Sra. Fernanda pediu fechamento às 23h. Ajuste a exceção da agenda da conta e confirme." />
        </label>
        {recipients.error ? <p className="text-sm text-destructive">{recipients.error.message}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-4"><Button variant="outline" onClick={onClose} disabled={send.isPending}>Cancelar</Button><Button disabled={send.isPending || !toUserId || message.trim().length < 10 || Boolean(recipients.error)} onClick={() => send.mutate({ toUserId: Number(toUserId), message })}>{send.isPending ? "Registrando..." : "Enviar mensagem"}</Button></div>
    </div>
  </div>;
}
