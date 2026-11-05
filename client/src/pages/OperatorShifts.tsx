import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceScreenMenu from "@/components/WorkspaceScreenMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { CalendarClock, RefreshCw, Users } from "lucide-react";
import { OPERATOR_SHIFT_LABELS, localDateKey, type OperatorShiftCode } from "@shared/operatorShift";
import { buildOperatorAttendanceCsv, OPERATOR_SCHEDULE_REASON_LABELS } from "./operatorAttendanceExport";

const ROLE_LABELS: Record<string, string> = { admin: "Administrador", supervisor: "Supervisor", operator: "Operador" };
const LOGOUT_LABELS: Record<string, string> = { logout: "Logoff normal", session_replaced: "Sessão substituída por novo login", session_expired: "Sessão expirada", revoked: "Sessão revogada" };
const dateDisplay = (value: unknown) => value ? new Date(value as string | number | Date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const shortDate = (value: unknown) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—";
const startOfMonth = (today: string) => `${today.slice(0, 7)}-01`;
const endOfMonth = (today: string) => { const [y, m] = today.split("-").map(Number); return `${today.slice(0, 7)}-${new Date(y, m, 0).getDate()}`; };

export default function OperatorShiftsPage() {
  const today = localDateKey(new Date());
  const [fromDate, setFromDate] = useState(startOfMonth(today));
  const [toDate, setToDate] = useState(endOfMonth(today));
  const [reportUserId, setReportUserId] = useState("all");
  const usersQuery = trpc.operatorShift.reportUsers.useQuery(undefined, { retry: false });
  const users = usersQuery.data || [];
  const reportQuery = trpc.operatorShift.report.useQuery({ fromDate, toDate, ...(reportUserId !== "all" ? { userId: Number(reportUserId) } : {}) }, { refetchOnWindowFocus: true });

  const current = reportQuery.data?.currentShift;
  const currentShifts = reportQuery.data?.currentShifts || (current ? [current] : []);
  const active = reportQuery.data?.activeOperators || [];
  const attendingNow = active.filter((entry) => entry.socketConnected);
  const activeUserIdSet = new Set(attendingNow.map((entry) => entry.userId));
  const downloadReport = () => {
    if (!reportQuery.data) return;
    const url = URL.createObjectURL(new Blob([buildOperatorAttendanceCsv(reportQuery.data.attendance)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `presenca-${fromDate}-${toDate}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <DashboardLayout workspaceMenuPlacement="page-header">
    <div className="h-full space-y-5 overflow-auto p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarClock className="h-6 w-6" /> Escalas e Presença</h1>
          <p className="mt-1 text-sm text-muted-foreground">Turnos em São Paulo · presença baseada em login e conexão ao PoliceCentral.</p>
        </div>
        <WorkspaceScreenMenu label="Outras telas" />
      </div>

      {reportQuery.error ? <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{reportQuery.error.message} <Button variant="outline" size="sm" onClick={() => void reportQuery.refetch()}>Tentar novamente</Button></div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Quem está trabalhando agora</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {currentShifts.length ? currentShifts.map((shiftWindow: any) => <div key={`${shiftWindow.workDate}:${shiftWindow.shiftCode}`} className="rounded-lg bg-muted/40 p-3 text-sm">
              <p><strong>Turno atual:</strong> {OPERATOR_SHIFT_LABELS[shiftWindow.shiftCode as OperatorShiftCode]} · {shortDate(shiftWindow.workDate)}</p>
              <p className="mt-1"><strong>Horário:</strong> {dateDisplay(shiftWindow.startAt)} até {dateDisplay(shiftWindow.endAt)}</p>
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Escalados para este turno</p>
                {shiftWindow.expectedOperators.length ? <div className="space-y-2">{shiftWindow.expectedOperators.map((person: any) => <div key={person.userId} className="flex items-center justify-between rounded border border-border p-2 text-sm">
                  <div><span className="font-medium">{person.name}</span><span className="ml-2 text-xs text-muted-foreground">{ROLE_LABELS[person.role] || person.role}{person.isException ? " · troca pontual" : ""}</span></div>
                  <span className={activeUserIdSet.has(person.userId) ? "text-emerald-400" : "text-amber-300"}>{activeUserIdSet.has(person.userId) ? "Conectado" : "Não conectado"}</span>
                </div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma escala cadastrada para este turno.</p>}
              </div>
            </div>) : <p className="text-sm text-muted-foreground">Carregando os turnos atuais...</p>}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessões abertas</p>
              {active.length ? <div className="space-y-2">{active.map((entry) => <div key={entry.attendanceId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-sm">
                <span>{entry.operatorName} · entrou {dateDisplay(entry.loginAt)}</span>
                <span className={entry.socketConnected ? "text-emerald-400" : "text-amber-300"}>{entry.socketConnected ? "Conectado agora" : "Sessão aberta, conexão ausente"}</span>
              </div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum operador com conexão ativa detectada.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Relatório individual de login e logoff</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-muted-foreground">De<InputDate value={fromDate} onChange={setFromDate} /></label>
              <label className="text-xs text-muted-foreground">Até<InputDate value={toDate} onChange={setToDate} /></label>
              <label className="text-xs text-muted-foreground">Operador
                <Select value={reportUserId} onValueChange={setReportUserId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{users.map((person) => <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>)}</SelectContent></Select>
              </label>
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={!reportQuery.data || Boolean(reportQuery.error)} onClick={downloadReport}>Exportar CSV</Button><Button variant="outline" size="sm" onClick={() => void reportQuery.refetch()} disabled={reportQuery.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
            {reportQuery.data?.resultLimitReached ? <p role="alert" className="text-xs text-amber-300">Exibindo até 2.000 sessões. Filtre um operador ou reduza o período para obter a relação completa.</p> : null}
            <div className="max-h-[330px] overflow-auto rounded border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted"><tr><th className="p-2">Operador</th><th className="p-2">Login</th><th className="p-2">Logoff</th><th className="p-2">Situação</th><th className="p-2">Escala / motivo informado</th></tr></thead>
                <tbody>{reportQuery.data?.attendance.length ? reportQuery.data.attendance.map((row) => <tr key={row.id} className="border-t border-border">
                  <td className="p-2">{row.operatorName}<span className="block text-muted-foreground">{ROLE_LABELS[row.role] || row.role}</span></td>
                  <td className="p-2">{dateDisplay(row.loginAt)}<span className="block text-muted-foreground">{row.shiftCode ? OPERATOR_SHIFT_LABELS[row.shiftCode as OperatorShiftCode] : "Sem turno vinculado"}</span></td>
                  <td className="p-2">{dateDisplay(row.logoutAt)}</td>
                  <td className="p-2">{row.logoutReason ? LOGOUT_LABELS[row.logoutReason] || row.logoutReason : "Sessão ativa"}</td>
                  <td className="p-2">{row.scheduleStatus === "scheduled" ? "Escalado" : row.scheduleStatus === "outside_window" ? <><span className="block text-amber-300">Fora da escala</span><span className="text-muted-foreground">{row.outOfScheduleReason ? OPERATOR_SCHEDULE_REASON_LABELS[row.outOfScheduleReason] || row.outOfScheduleReason : "Aguardando justificativa"}</span></> : "Sem classificação"}</td>
                </tr>) : <tr><td colSpan={5} className="p-5 text-center text-muted-foreground">Nenhum login registrado neste período.</td></tr>}</tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">“Conectado agora” significa que a sessão autenticada tem uma conexão ativa com o servidor; uma sessão sem conexão não é contada como operador trabalhando.</p>
          </CardContent>
        </Card>
      </div>

      <Card><CardHeader><CardTitle className="text-base">Escala prevista no período</CardTitle><p className="text-xs text-muted-foreground">A escala é uma previsão. Login e logoff são registros reais independentes; trabalhar num dia diferente não muda o ciclo permanente.</p></CardHeader><CardContent>
        <div className="max-h-[320px] overflow-auto rounded border border-border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">Data</th><th className="p-2">Operador</th><th className="p-2">Turno</th><th className="p-2">Origem</th></tr></thead><tbody>
          {reportQuery.data?.monthlyPlan.length ? reportQuery.data.monthlyPlan.map((row) => <tr key={`${row.userId}:${row.workDate}`} className="border-t border-border"><td className="p-2">{shortDate(row.workDate)}</td><td className="p-2">{row.operatorName}</td><td className="p-2">{OPERATOR_SHIFT_LABELS[row.shiftCode]}</td><td className="p-2">{row.isException ? `Troca pontual · ${row.reason}` : "Escala permanente"}</td></tr>) : <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nenhuma escala cadastrada para o período.</td></tr>}
        </tbody></table></div>
      </CardContent></Card>

    </div>
  </DashboardLayout>;
}

function InputDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />;
}
