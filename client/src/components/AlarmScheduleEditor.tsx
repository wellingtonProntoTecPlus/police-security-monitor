import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CalendarClock, Clock3, PauseCircle, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type System = { id: number; account: string; brand: string; model?: string | null };
type Props = { system?: System | null };
type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type ScheduleForm = Record<string, string | boolean>;

const DAYS: Array<{ key: DayKey; label: string }> = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];
const EMPTY_FORM: ScheduleForm = {
  isActive: true,
  name: "Agenda operacional",
  holidayArm: "",
  holidayDisarm: "",
  ...Object.fromEntries(DAYS.flatMap(({ key }) => [[`${key}Arm`, ""], [`${key}Disarm`, ""]])),
};

function dateForInput(value = new Date()) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function displayDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("pt-BR");
}

export default function AlarmScheduleEditor({ system }: Props) {
  const systemId = system?.id || 0;
  const utils = trpc.useUtils();
  const { data: schedules = [], isLoading, isError: scheduleIsError, error: scheduleError, refetch: refetchSchedules } = trpc.alarmSchedule.list.useQuery({ alarmSystemId: systemId }, { enabled: Boolean(systemId), retry: false });
  const { data: exceptionData, isLoading: exceptionsLoading, isError: exceptionIsError, error: exceptionError, refetch: refetchExceptions } = trpc.alarmSchedule.exceptions.useQuery({ alarmSystemId: systemId }, { enabled: Boolean(systemId), retry: false });
  const schedule = schedules.find((item: any) => Number(item.partition) === 1) as any;
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
  const [exceptionDate, setExceptionDate] = useState(dateForInput());
  const [exceptionMode, setExceptionMode] = useState<"suspended" | "override">("suspended");
  const [exceptionArmAt, setExceptionArmAt] = useState("");
  const [exceptionDisarmAt, setExceptionDisarmAt] = useState("");
  const [requester, setRequester] = useState("");
  const [reason, setReason] = useState("");
  const activeExceptions = useMemo(() => (exceptionData?.items || []).filter((item: any) => item.isActive), [exceptionData?.items]);

  useEffect(() => {
    if (!schedule) {
      setForm(EMPTY_FORM);
      return;
    }
    const next: ScheduleForm = { isActive: Boolean(schedule.isActive), name: schedule.name || "Agenda operacional", holidayArm: schedule.holidayArm || "", holidayDisarm: schedule.holidayDisarm || "" };
    for (const { key } of DAYS) {
      next[`${key}Arm`] = schedule[`${key}Arm`] || "";
      next[`${key}Disarm`] = schedule[`${key}Disarm`] || "";
    }
    setForm(next);
  }, [schedule]);

  const refresh = async () => {
    await Promise.all([
      utils.alarmSchedule.list.invalidate({ alarmSystemId: systemId }),
      utils.alarmSchedule.exceptions.invalidate({ alarmSystemId: systemId }),
      utils.dashboard.scheduleAlerts.invalidate(),
    ]);
  };
  const saveSchedule = trpc.alarmSchedule.save.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Agenda salva para esta central."); },
    onError: (error) => toast.error(`Não foi possível salvar a agenda: ${error.message}`),
  });
  const saveException = trpc.alarmSchedule.saveException.useMutation({
    onSuccess: async () => {
      await refresh();
      setRequester(""); setReason(""); setExceptionArmAt(""); setExceptionDisarmAt("");
      toast.success("Exceção registrada com auditoria.");
    },
    onError: (error) => toast.error(`Não foi possível registrar a exceção: ${error.message}`),
  });
  const cancelException = trpc.alarmSchedule.cancelException.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Exceção cancelada; a agenda normal voltou a valer."); },
    onError: (error) => toast.error(`Não foi possível cancelar a exceção: ${error.message}`),
  });

  if (!system) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Cadastre ou selecione uma central para configurar a agenda.</CardContent></Card>;

  const setTime = (field: string, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const handleSaveSchedule = () => {
    const times = Object.fromEntries(Object.entries(form).filter(([key]) => key.endsWith("Arm") || key.endsWith("Disarm")));
    saveSchedule.mutate({
      alarmSystemId: systemId,
      partition: 1,
      name: String(form.name || "Agenda operacional"),
      isActive: Boolean(form.isActive),
      ...times,
    } as any);
  };
  const handleSaveException = () => {
    if (!requester.trim()) { toast.error("Informe quem solicitou a alteração."); return; }
    if (reason.trim().length < 5) { toast.error("Descreva o motivo da exceção (mínimo de 5 caracteres)."); return; }
    if (exceptionMode === "override" && !exceptionArmAt && !exceptionDisarmAt) { toast.error("Informe pelo menos um novo horário para substituir a agenda."); return; }
    saveException.mutate({
      alarmSystemId: systemId,
      overrideDate: exceptionDate,
      mode: exceptionMode,
      armAt: exceptionMode === "override" ? exceptionArmAt : undefined,
      disarmAt: exceptionMode === "override" ? exceptionDisarmAt : undefined,
      requester: requester.trim(),
      reason: reason.trim(),
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" /> Agenda da central · Conta {system.account}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Os horários pertencem a esta conta. Sem agenda ativa, Arme, Desarme e Stay vão somente ao relatório, sem abrir fila.</p>
            </div>
            {schedule && <Badge variant={schedule.isActive ? "default" : "secondary"}>{schedule.isActive ? "Agenda ativa" : "Agenda desativada"}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando horários…</p> : scheduleIsError ? <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm"><p className="font-semibold text-red-300">Não foi possível carregar os horários desta conta.</p><p className="mt-1 text-xs text-muted-foreground">{scheduleError?.message || "Verifique a conexão e tente novamente."}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => void refetchSchedules()}>Tentar novamente</Button></div> : <>
            <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <div><Label htmlFor="alarm-schedule-name">Nome da agenda</Label><Input id="alarm-schedule-name" className="mt-1" value={String(form.name || "")} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
              <label className="flex cursor-pointer items-center gap-2 self-end rounded-md border border-border p-2 text-sm"><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />Aplicar esta agenda para a central</label>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <div className="grid min-w-[600px] grid-cols-[1.2fr_1fr_1fr] bg-muted/50 px-3 py-2 text-xs font-bold uppercase text-muted-foreground"><span>Dia</span><span>Desarmar às</span><span>Armar às</span></div>
              {DAYS.map(({ key, label }) => <div key={key} className="grid min-w-[600px] grid-cols-[1.2fr_1fr_1fr] items-center gap-3 border-t border-border px-3 py-2">
                <span className="text-sm font-medium">{label}</span>
                <Input aria-label={`${label} desarmar às`} type="time" value={String(form[`${key}Disarm`] || "")} onChange={(event) => setTime(`${key}Disarm`, event.target.value)} />
                <Input aria-label={`${label} armar às`} type="time" value={String(form[`${key}Arm`] || "")} onChange={(event) => setTime(`${key}Arm`, event.target.value)} />
              </div>)}
            </div>
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-blue-400" />Horários para feriados cadastrados pela parceira</div>
              <p className="mb-3 text-xs text-muted-foreground">O calendário é comum da parceira, mas estes horários são próprios desta conta. Deixe em branco quando não houver transição programada no feriado.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Desarmar às</Label><Input className="mt-1" type="time" value={String(form.holidayDisarm || "")} onChange={(event) => setTime("holidayDisarm", event.target.value)} /></div>
                <div><Label>Armar às</Label><Input className="mt-1" type="time" value={String(form.holidayArm || "")} onChange={(event) => setTime("holidayArm", event.target.value)} /></div>
              </div>
            </div>
            <div className="flex justify-end"><Button disabled={saveSchedule.isPending} onClick={handleSaveSchedule}>{saveSchedule.isPending ? "Salvando…" : "Salvar agenda"}</Button></div>
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><PauseCircle className="h-4 w-4 text-amber-400" />Exceção para um dia específico</CardTitle><p className="text-xs text-muted-foreground">Use para feriado, domingo especial, confraternização ou trabalho fora do horário. Suspender ignora a tabela nesse dia; substituir permite indicar novo horário. A regra volta automaticamente no próximo dia.</p></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Data</Label><Input className="mt-1" type="date" min={dateForInput()} value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} /></div>
            <div><Label>O que fazer</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={exceptionMode} onChange={(event) => setExceptionMode(event.target.value as "suspended" | "override")}><option value="suspended">Suspender agenda neste dia</option><option value="override">Substituir horário(s) neste dia</option></select></div>
            {exceptionMode === "override" && <>
              <div><Label>Novo horário para desarmar (opcional)</Label><Input className="mt-1" type="time" value={exceptionDisarmAt} onChange={(event) => setExceptionDisarmAt(event.target.value)} /></div>
              <div><Label>Novo horário para armar (opcional)</Label><Input className="mt-1" type="time" value={exceptionArmAt} onChange={(event) => setExceptionArmAt(event.target.value)} /></div>
            </>}
            <div><Label>Quem solicitou</Label><Input className="mt-1" placeholder="Nome do cliente/contato" value={requester} onChange={(event) => setRequester(event.target.value)} /></div>
            <div><Label>Motivo da solicitação</Label><Input className="mt-1" placeholder="Ex.: confraternização até mais tarde" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
          </div>
          <div className="flex justify-end"><Button disabled={saveException.isPending} onClick={handleSaveException}><Plus className="mr-2 h-4 w-4" />{saveException.isPending ? "Registrando…" : "Registrar exceção"}</Button></div>
          <div className="border-t border-border pt-3">
            <h3 className="mb-2 text-sm font-semibold">Exceções e auditoria</h3>
            {exceptionsLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : exceptionIsError ? <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm"><p className="font-semibold text-red-300">Não foi possível carregar as exceções desta conta.</p><p className="mt-1 text-xs text-muted-foreground">{exceptionError?.message || "Verifique a conexão e tente novamente."}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => void refetchExceptions()}>Tentar novamente</Button></div> : activeExceptions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma exceção ativa para esta conta.</p> : <div className="space-y-2">{activeExceptions.map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"><div className="min-w-0"><p className="text-sm font-semibold">{displayDate(item.overrideDate)} · {item.mode === "suspended" ? "Agenda suspensa" : `Horários substituídos${item.disarmAt ? ` · desarmar ${item.disarmAt}` : ""}${item.armAt ? ` · armar ${item.armAt}` : ""}`}</p><p className="text-xs text-muted-foreground">Solicitante: {item.requester} · {item.reason}</p></div><Button variant="outline" size="sm" disabled={cancelException.isPending} onClick={() => cancelException.mutate({ id: item.id })}><RefreshCw className="mr-2 h-3.5 w-3.5" />Cancelar</Button></div>)}</div>}
          </div>
          {(exceptionData?.audit || []).length > 0 && <div className="space-y-1 border-t border-border pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registro de alterações</p>{(exceptionData?.audit || []).slice(0, 12).map((item: any) => <p key={item.id} className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("pt-BR")} · {item.operatorName} · {item.action} · {displayDate(item.overrideDate)} · {item.requester}: {item.reason}</p>)}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
