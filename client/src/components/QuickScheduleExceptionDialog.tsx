import { useEffect, useMemo, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type System = { id: number; account: string; clientName?: string | null; brand?: string | null; model?: string | null };
type Props = { system: System; onClose: () => void; onSaved?: () => void };
type Duration = "hour" | "day" | "week";

function saoPauloDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (key: string) => parts.find((part) => part.type === key)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function exceptionEndLabel(item: any) {
  if (!item.validUntilAt) return "válida neste dia";
  const end = new Date(item.validUntilAt);
  return `até ${end.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}`;
}

export default function QuickScheduleExceptionDialog({ system, onClose, onSaved }: Props) {
  const utils = trpc.useUtils();
  const today = useMemo(() => saoPauloDateKey(), []);
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState<Duration>("day");
  const [mode, setMode] = useState<"suspended" | "override">("suspended");
  const [armAt, setArmAt] = useState("");
  const [disarmAt, setDisarmAt] = useState("");
  const [requester, setRequester] = useState("");
  const [reason, setReason] = useState("");
  const { data, isLoading, error } = trpc.alarmSchedule.exceptions.useQuery({ alarmSystemId: system.id }, { retry: false });
  const activeItems = (data?.items || []).filter((item: any) => item.isActive);

  useEffect(() => {
    if (duration === "hour") setDate(today);
  }, [duration, today]);

  const save = trpc.alarmSchedule.saveException.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.alarmSchedule.exceptions.invalidate({ alarmSystemId: system.id }),
        utils.dashboard.scheduleAlerts.invalidate(),
        utils.incident.openQueue.invalidate(),
      ]);
      toast.success("Exceção da agenda registrada e auditada.");
      onSaved?.();
      onClose();
    },
    onError: (error) => toast.error(`Não foi possível alterar a agenda: ${error.message}`),
  });
  const cancel = trpc.alarmSchedule.cancelException.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.alarmSchedule.exceptions.invalidate({ alarmSystemId: system.id }),
        utils.dashboard.scheduleAlerts.invalidate(),
      ]);
      toast.success("Exceção cancelada; a agenda normal voltou a valer.");
    },
    onError: (error) => toast.error(`Não foi possível cancelar a exceção: ${error.message}`),
  });

  const submit = () => {
    if (!requester.trim() || requester.trim().length < 2) return toast.error("Informe quem solicitou a alteração.");
    if (reason.trim().length < 5) return toast.error("Informe o motivo da solicitação (mínimo de 5 caracteres).");
    if (duration === "hour" && date !== today) return toast.error("A suspensão de uma hora deve começar hoje.");
    if (mode === "override" && !armAt && !disarmAt) return toast.error("Informe pelo menos um novo horário.");
    if (!window.confirm(`CONFIRMAR EXCEÇÃO DE AGENDA?\n\nConta ${system.account} · ${system.clientName || "Cliente"}\nAção: ${mode === "suspended" ? "suspender a agenda" : "substituir horário(s)"}\nDuração: ${duration === "hour" ? "1 hora a partir de agora" : duration === "day" ? "o dia selecionado" : "7 dias a partir do dia selecionado"}\nSolicitado por: ${requester.trim()}\nMotivo: ${reason.trim()}`)) return;
    save.mutate({
      alarmSystemId: system.id,
      overrideDate: date,
      duration,
      mode,
      armAt: mode === "override" ? armAt : undefined,
      disarmAt: mode === "override" ? disarmAt : undefined,
      requester: requester.trim(),
      reason: reason.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-3" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="quick-schedule-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-amber-500/30 bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="quick-schedule-title" className="flex items-center gap-2 font-bold text-amber-200"><CalendarClock className="h-5 w-5" /> Alteração rápida da agenda</h2>
            <p className="mt-1 text-sm text-foreground">Conta {system.account} · {system.clientName || "Cliente"}</p>
            <p className="text-xs text-muted-foreground">{system.brand || "Central"} {system.model || ""}</p>
          </div>
          <button type="button" aria-label="Fechar" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={onClose}><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 p-5">
          {error && <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">Não foi possível carregar as exceções desta conta: {error.message}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="quick-schedule-date">Data inicial</Label><Input id="quick-schedule-date" className="mt-1" type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} disabled={duration === "hour"} /></div>
            <div><Label htmlFor="quick-schedule-duration">Duração</Label><select id="quick-schedule-duration" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={duration} onChange={(event) => setDuration(event.target.value as Duration)}><option value="hour">1 hora a partir de agora</option><option value="day">Somente este dia</option><option value="week">7 dias</option></select></div>
            <div className="sm:col-span-2"><Label htmlFor="quick-schedule-mode">O que o cliente solicitou?</Label><select id="quick-schedule-mode" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={mode} onChange={(event) => setMode(event.target.value as "suspended" | "override")}><option value="suspended">Suspender a agenda durante o período</option><option value="override">Alterar temporariamente horário(s)</option></select></div>
            {mode === "override" && <>
              <div><Label htmlFor="quick-disarm-at">Novo horário para desarmar (opcional)</Label><Input id="quick-disarm-at" className="mt-1" type="time" value={disarmAt} onChange={(event) => setDisarmAt(event.target.value)} /></div>
              <div><Label htmlFor="quick-arm-at">Novo horário para armar (opcional)</Label><Input id="quick-arm-at" className="mt-1" type="time" value={armAt} onChange={(event) => setArmAt(event.target.value)} /></div>
            </>}
            <div><Label htmlFor="quick-schedule-requester">Quem solicitou</Label><Input id="quick-schedule-requester" className="mt-1" placeholder="Cliente ou contato" value={requester} onChange={(event) => setRequester(event.target.value)} /></div>
            <div><Label htmlFor="quick-schedule-reason">Motivo</Label><Input id="quick-schedule-reason" className="mt-1" placeholder="Ex.: confraternização até mais tarde" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
          </div>
          <p className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">A alteração fica vinculada a esta central, tem prazo de validade e registra operador, solicitante e motivo. Ao terminar ou cancelar, a agenda semanal/feriado volta a valer.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button className="bg-amber-600 text-white hover:bg-amber-700" disabled={save.isPending || Boolean(error)} onClick={submit}>{save.isPending ? "Registrando…" : "Confirmar alteração"}</Button></div>
          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-semibold">Exceções ativas</h3>
            {isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p> : activeItems.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma exceção ativa para esta central.</p> : <div className="space-y-2">{activeItems.map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"><div className="min-w-0"><p className="text-xs font-semibold">{item.mode === "suspended" ? "Agenda suspensa" : `Horário alterado${item.disarmAt ? ` · desarmar ${item.disarmAt}` : ""}${item.armAt ? ` · armar ${item.armAt}` : ""}`} · {exceptionEndLabel(item)}</p><p className="text-[11px] text-muted-foreground">Solicitante: {item.requester} · {item.reason}</p></div><Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: item.id })}>Cancelar exceção</Button></div>)}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
