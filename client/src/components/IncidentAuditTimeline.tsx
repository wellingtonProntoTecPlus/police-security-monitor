import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Clock3, History, RotateCw } from "lucide-react";
import { formatIncidentAuditDateTime, incidentAuditActionLabel } from "@shared/incidentAudit";

export default function IncidentAuditTimeline({ incidentId, title = true, active = true }: { incidentId?: number | null; title?: boolean; active?: boolean }) {
  const [beforeIds, setBeforeIds] = useState<number[]>([]);
  useEffect(() => setBeforeIds([]), [incidentId]);
  const beforeId = beforeIds.at(-1);
  const query = trpc.incident.auditTrail.useQuery({ incidentId: incidentId || 0, beforeId }, {
    enabled: !!incidentId && active, refetchInterval: beforeId || !active ? false : 5_000, refetchOnWindowFocus: true, retry: false,
  });
  return <section aria-label="Logs persistidos da ocorrência" className="space-y-3 text-foreground">
    {title && <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-base font-bold"><History className="h-4 w-4 text-cyan-300" /> Logs da Ocorrência</h3><Button size="sm" variant="outline" onClick={() => void query.refetch()} disabled={!incidentId || query.isFetching} aria-label="Atualizar logs"><RotateCw className="h-3.5 w-3.5" /></Button></div>}
    {!incidentId ? <p className="text-sm leading-relaxed">Selecione uma ocorrência para consultar o log. Os registros permanecem disponíveis em Relatórios → Logs de auditoria.</p> : query.isLoading ? <p role="status" className="text-sm">Carregando logs persistidos…</p> : query.error ? <div role="alert" className="rounded-md border border-red-400/50 bg-red-500/10 p-3 text-sm text-red-100">Não foi possível consultar a auditoria. Isto não significa que o histórico está vazio.<Button size="sm" variant="outline" className="mt-2" onClick={() => void query.refetch()}>Tentar novamente</Button></div> : <>
      <p className="text-xs font-medium text-cyan-200">Ocorrência #{incidentId} · {beforeId ? "Registros anteriores" : "Mais recentes primeiro"} · horários de Brasília</p>
      {query.data?.items.length ? <ol className="space-y-2" aria-live="polite" aria-relevant="additions">
        {query.data.items.map((entry) => <li key={entry.id} className="rounded-md border border-border bg-muted/25 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-200"><Clock3 className="h-3 w-3 shrink-0" /><time>{formatIncidentAuditDateTime(entry.createdAt)}</time></p>
          <p className="mt-1 text-sm font-bold text-foreground">{entry.operatorName} · {incidentAuditActionLabel(entry)}</p>
          {entry.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{entry.note}</p>}
        </li>)}
      </ol> : <p className="rounded border border-dashed border-border p-3 text-sm">Ainda não há registros persistidos para esta ocorrência.</p>}
      <div className="flex flex-wrap gap-2">
        {beforeId && <Button size="sm" variant="outline" onClick={() => setBeforeIds((ids) => ids.slice(0, -1))}>Voltar aos mais recentes</Button>}
        {query.data?.nextCursor && <Button size="sm" variant="outline" onClick={() => setBeforeIds((ids) => [...ids, query.data!.nextCursor!])}>Ver registros anteriores</Button>}
      </div>
    </>}
  </section>;
}
