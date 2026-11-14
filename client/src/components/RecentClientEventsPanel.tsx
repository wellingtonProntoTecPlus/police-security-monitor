import { AlertTriangle, Clock3, Loader2, RotateCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type RecentClientEventsPanelProps = {
  incidentId: number;
  currentEventId?: number;
};

function formatReceivedAt(value: string | Date | null | undefined) {
  if (value === null || value === undefined) return "Horário não informado";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Horário não informado";
  return date.toLocaleString("pt-BR");
}

export default function RecentClientEventsPanel({ incidentId, currentEventId }: RecentClientEventsPanelProps) {
  const query = trpc.incident.recentClientEvents.useQuery(
    { incidentId },
    { enabled: Number.isInteger(incidentId) && incidentId > 0, refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 0 },
  );

  if (query.isLoading) {
    return <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Consultando eventos do cliente…</div>;
  }

  if (query.error) {
    return <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-5 text-sm">
      <p className="flex items-center gap-2 font-semibold text-red-200"><AlertTriangle className="h-4 w-4" /> Não foi possível consultar os eventos recentes.</p>
      <p className="mt-1 text-muted-foreground">Nenhum evento foi alterado. Verifique se a ocorrência continua aberta e tente novamente.</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RotateCw className="mr-2 h-3.5 w-3.5" /> Tentar novamente</Button>
    </div>;
  }

  const events = query.data?.events || [];
  return <section aria-label="Eventos recentes do cliente">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
      <p className="text-xs text-muted-foreground">Exibindo até 20 eventos mais recentes de todas as centrais identificadas deste cliente. A lista atualiza automaticamente enquanto estiver aberta; os eventos permanecem no histórico do sistema.</p>
      <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-cyan-200" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Atualizar eventos recentes"><RotateCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
    </div>
    {events.length === 0 ? <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum evento recebido para as centrais identificadas deste cliente.</p> : <ol className="space-y-2">
      {events.map((event) => {
        const isCurrentEvent = event.id === (currentEventId ?? query.data?.incidentEventId);
        const receivedAtDateTime = event.receivedAt ? new Date(event.receivedAt).toISOString() : undefined;
        return <li key={event.id} className={`rounded-lg border p-3 ${isCurrentEvent ? "border-amber-400/45 bg-amber-400/5" : "border-border bg-black/10"}`}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-bold text-foreground">{event.qualifier}{event.eventCode}</span>
                {isCurrentEvent && <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">Origem desta ocorrência</span>}
              </div>
              <p className="mt-1 break-words text-sm font-semibold text-foreground">{event.description || "Evento sem descrição cadastrada"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Conta <span className="font-mono text-foreground">{event.account}</span> · {event.brand}{event.systemModel ? ` ${event.systemModel}` : ""}</p>
              {(event.partition || event.zoneUser) && <p className="mt-1 text-xs text-muted-foreground">{event.partition ? `Partição ${event.partition}` : ""}{event.partition && event.zoneUser ? " · " : ""}{event.zoneUser ? `Zona/usuário ${event.zoneUser}` : ""}</p>}
            </div>
            <time className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" dateTime={receivedAtDateTime}><Clock3 className="h-3.5 w-3.5" /> {formatReceivedAt(event.receivedAt)}</time>
          </div>
        </li>;
      })}
    </ol>}
    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Consulta somente leitura; eventos de outros clientes e dados brutos da comunicação não são exibidos.</p>
  </section>;
}
