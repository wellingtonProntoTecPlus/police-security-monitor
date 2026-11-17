import { useState } from "react";
import { toast } from "sonner";
import { getCompatecReconciliationOptions, type CompatecReconciliationOutcome } from "@shared/compatecCommandReconciliation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type IndeterminateCommand = {
  id: number;
  incidentId: number | null;
  operatorName: string | null;
  commandType: string;
  status: string;
  reason: string;
  commandPayload: string;
  responsePayload: string | null;
  createdAt: Date | string;
};

const COMMAND_LABELS: Record<string, string> = {
  configure_zones: "Configuração de setores AK2→AK1",
  arm: "Arme Compatec",
  disarm: "Desarme Compatec",
  isolate_zone: "Inibição de setor",
  restore_zone: "Retirada de anulação",
  query_status: "Consulta de estado",
  query_sectors: "Consulta de setores",
};

function commandSummary(command: IndeterminateCommand) {
  try {
    const payload = JSON.parse(command.commandPayload || "{}");
    if (Array.isArray(payload.zoneChanges)) {
      return payload.zoneChanges.map((change: any) => {
        const arm = change.armState === "armed" ? "Armar" : change.armState === "disarmed" ? "Desarmar" : null;
        const bypass = change.bypassState === "annulled" ? "Anular" : change.bypassState === "restored" ? "Retirar anulação" : null;
        return `Setor ${change.zoneNumber}: ${[arm, bypass].filter(Boolean).join(" + ")}`;
      }).join(" · ");
    }
  } catch { /* Payloads legados não incluem detalhe de setores. */ }
  return command.reason;
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Horário não informado" : new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium",
  }).format(date);
}

export default function CompatecCommandReconciliationPanel({ alarmSystemId }: { alarmSystemId: number }) {
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<number, { outcome: CompatecReconciliationOutcome | ""; verificationMethod: string; details: string }>>({});
  const query = trpc.remoteCommand.indeterminateCompatec.useQuery({ alarmSystemId }, {
    enabled: alarmSystemId > 0,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const reconcile = trpc.remoteCommand.reconcileCompatecCommand.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.remoteCommand.list.invalidate({ alarmSystemId, limit: 8 }),
        utils.remoteCommand.indeterminateCompatec.invalidate({ alarmSystemId }),
      ]);
      setDrafts((current) => { const next = { ...current }; delete next[result.commandId]; return next; });
      toast.success("Conferência registrada. O bloqueio deste comando foi liberado; nenhuma transmissão foi feita.");
    },
    onError: (error) => toast.error(error.message),
  });

  const commands = query.data || [];
  if (!query.isLoading && !query.error && commands.length === 0) return null;

  function updateDraft(commandId: number, field: "outcome" | "verificationMethod" | "details", value: string) {
    setDrafts((current) => {
      const previous = current[commandId] || { outcome: "" as const, verificationMethod: "", details: "" };
      return {
        ...current,
        [commandId]: field === "outcome"
          ? { ...previous, outcome: value as CompatecReconciliationOutcome | "" }
          : { ...previous, [field]: value },
      };
    });
  }

  function submit(command: IndeterminateCommand) {
    const draft = drafts[command.id];
    if (!draft?.outcome || draft.verificationMethod.trim().length < 5 || draft.details.trim().length < 5) {
      toast.warning("Informe o resultado, como a central foi conferida e o que foi observado.");
      return;
    }
    const outcomeLabel = getCompatecReconciliationOptions(command.commandType).find((option) => option.value === draft.outcome)?.label || draft.outcome;
    const confirmed = window.confirm([
      "REGISTRAR CONFERÊNCIA MANUAL DO COMANDO?",
      "",
      `Comando #${command.id} · ${COMMAND_LABELS[command.commandType] || command.commandType}`,
      `Resultado: ${outcomeLabel}`,
      `Como foi conferido: ${draft.verificationMethod.trim()}`,
      `Observado: ${draft.details.trim()}`,
      "",
      "Esta ação registra operador e horário; não envia nem repete quadros físicos. A liberação só se aplica depois desta conferência registrada.",
    ].join("\n"));
    if (!confirmed) return;
    reconcile.mutate({
      commandId: command.id,
      outcome: draft.outcome,
      verificationMethod: draft.verificationMethod.trim(),
      details: draft.details.trim(),
    });
  }

  return <section aria-label="Conferência manual de comandos Compatec" className="mt-4 space-y-3 rounded-lg border border-red-400/50 bg-red-500/10 p-3">
    <div>
      <h5 className="text-sm font-bold text-red-100">Comando sem resultado confirmado</h5>
      <p className="mt-1 text-xs leading-relaxed text-red-50/90">O sistema não reenviará essa solicitação. Para liberar novos comandos, confira primeiro o estado real da central e registre a conferência abaixo. Isso não é confirmação eletrônica.</p>
    </div>
    {query.isLoading ? <p role="status" className="text-xs">Consultando comandos que aguardam conferência…</p>
      : query.error ? <div role="alert" className="text-xs text-red-100">Não foi possível carregar as conferências pendentes. Tente atualizar o histórico.</div>
        : <div className="space-y-3">
          {commands.map((command) => {
            const draft = drafts[command.id] || { outcome: "" as const, verificationMethod: "", details: "" };
            const options = getCompatecReconciliationOptions(command.commandType);
            return <article key={command.id} className="space-y-2 rounded-md border border-red-300/30 bg-black/20 p-3">
              <div>
                <p className="text-xs font-bold text-red-100">#{command.id} · {COMMAND_LABELS[command.commandType] || command.commandType}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Solicitado por {command.operatorName || "operador"} · {formatDate(command.createdAt)}{command.incidentId ? ` · ocorrência #${command.incidentId}` : ""}</p>
                <p className="mt-1 text-xs text-foreground">{commandSummary(command)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Motivo: {command.reason}</p>
              </div>
              <label className="block text-xs font-medium text-foreground">Resultado observado
                <select aria-label={`Resultado da conferência do comando ${command.id}`} value={draft.outcome} disabled={reconcile.isPending} onChange={(event) => updateDraft(command.id, "outcome", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-foreground">
                  <option value="">Selecione…</option>
                  {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-foreground">Como conferiu
                <input aria-label={`Método de conferência do comando ${command.id}`} value={draft.verificationMethod} maxLength={255} disabled={reconcile.isPending} onChange={(event) => updateDraft(command.id, "verificationMethod", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Ex.: aplicativo Compatec, contato com responsável" />
              </label>
              <label className="block text-xs font-medium text-foreground">O que foi verificado
                <Textarea aria-label={`Detalhes da conferência do comando ${command.id}`} value={draft.details} maxLength={2000} disabled={reconcile.isPending} onChange={(event) => updateDraft(command.id, "details", event.target.value)} className="mt-1 min-h-16" placeholder="Registre os setores/estado observados e qualquer diferença." />
              </label>
              <Button type="button" size="sm" variant="outline" className="w-full border-red-300/40 text-red-50" disabled={reconcile.isPending || !draft.outcome || draft.verificationMethod.trim().length < 5 || draft.details.trim().length < 5} onClick={() => submit(command)}>
                {reconcile.isPending ? "Registrando conferência…" : "Registrar conferência e liberar bloqueio"}
              </Button>
            </article>;
          })}
        </div>}
  </section>;
}
