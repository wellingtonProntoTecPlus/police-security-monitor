import { Button } from "@/components/ui/button";
import { PROCEDURE_TYPE_LABELS, type ProcedureType } from "@shared/operationalProcedures";

type Procedure = { id: number; title: string; description: string; procedureType?: string };
type Props = { eventType?: ProcedureType; procedures: Procedure[]; hasSpecificProcedure?: boolean; isLoading?: boolean; error?: unknown; clientIdentified: boolean; onRetry: () => void; onViewAll?: () => void };

export default function OperationalProcedurePanel({ eventType = "general", procedures, hasSpecificProcedure, isLoading, error, clientIdentified, onRetry, onViewAll }: Props) {
  return <section aria-label="Protocolo de atendimento" className="rounded-lg border border-primary/30 bg-primary/5 p-4">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-base font-bold text-foreground">Providências operacionais</h3><p className="mt-0.5 text-xs text-muted-foreground">Orientações cadastradas para este cliente — {PROCEDURE_TYPE_LABELS[eventType]}.</p></div>
      {onViewAll && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onViewAll}>Ver tudo</Button>}
    </div>
    {!clientIdentified ? <p role="alert" className="mt-3 rounded-md border border-amber-500/40 p-3 text-sm text-amber-200">Cliente não identificado. Não é possível consultar seu protocolo de atendimento.</p>
      : isLoading ? <p role="status" className="mt-3 text-sm text-muted-foreground">Consultando protocolo de atendimento…</p>
      : error ? <div role="alert" className="mt-3 rounded-md border border-destructive/40 p-3 text-sm">Não foi possível consultar o protocolo. Não considere este atendimento como sem orientações. <Button variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button></div>
      : <div className="mt-3 space-y-3">
        {!hasSpecificProcedure && <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-200">Nenhum protocolo de {PROCEDURE_TYPE_LABELS[eventType].toLowerCase()} cadastrado para este cliente. Solicite as orientações ao supervisor; anotações do atendimento não substituem o protocolo.</p>}
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">{procedures.map(procedure => <article key={procedure.id} className="rounded-md border border-primary/20 bg-black/20 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-primary">{PROCEDURE_TYPE_LABELS[(procedure.procedureType || "general") as ProcedureType] || "Orientação cadastrada"}</p>
          <h4 className="mt-1 font-semibold text-foreground">{procedure.title}</h4>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{procedure.description}</p>
        </article>)}</div>
      </div>}
  </section>;
}
