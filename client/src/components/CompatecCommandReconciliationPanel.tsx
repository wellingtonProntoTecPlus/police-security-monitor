import { useState } from "react";
import { toast } from "sonner";
import {
  getCompatecReconciliationOptions,
  isManualCompatecApplication,
  type CompatecReconciliationOutcome,
} from "@shared/compatecCommandReconciliation";
import {
  getCompatecManualObservedStateOptions,
  getCompatecManualVerificationSourceOptions,
} from "@shared/compatecArmAuthorization";
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

type Draft = {
  outcome: CompatecReconciliationOutcome | "";
  verificationMethod: string;
  details: string;
  verificationSource: string;
  observedState: string;
  evidenceReference: string;
};

const EMPTY_DRAFT: Draft = {
  outcome: "",
  verificationMethod: "",
  details: "",
  verificationSource: "",
  observedState: "",
  evidenceReference: "",
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

function releaseButtonLabel(outcome: CompatecReconciliationOutcome | "") {
  if (outcome === "not_applied") return "Registrar não aplicado";
  if (outcome === "verified") return "Registrar estado final confirmado";
  if (outcome === "applied" || outcome === "partial") return "Registrar conferência";
  return "Registrar conferência";
}

export default function CompatecCommandReconciliationPanel({ alarmSystemId }: { alarmSystemId: number }) {
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
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
      toast.success("Conferência registrada e auditada. Nenhum bloqueio permanece e nenhuma transmissão foi feita.");
    },
    onError: (error) => toast.error(error.message),
  });

  const commands = query.data || [];
  if (!query.isLoading && !query.error && commands.length === 0) return null;

  function updateDraft(commandId: number, field: keyof Draft, value: string) {
    setDrafts((current) => {
      const previous = current[commandId] || { ...EMPTY_DRAFT };
      return {
        ...current,
        [commandId]: field === "outcome"
          ? { ...previous, outcome: value as CompatecReconciliationOutcome | "", observedState: "" }
          : { ...previous, [field]: value },
      };
    });
  }

  function submit(command: IndeterminateCommand, draft: Draft) {
    const applicationPending = isManualCompatecApplication(command.responsePayload);
    if (!draft.outcome || draft.verificationMethod.trim().length < 5 || draft.details.trim().length < 5
      || !draft.verificationSource || !draft.observedState || draft.evidenceReference.trim().length < 5) {
      toast.warning("Informe fonte direta, estado observado, referência rastreável, método e detalhes.");
      return;
    }
    if (draft.verificationSource === "external_report") {
      toast.error("Relato de terceiros não comprova a execução nem a não execução do comando. Consulte um registro técnico direto.");
      return;
    }
    const outcomeLabel = getCompatecReconciliationOptions(command.commandType, applicationPending)
      .find((option) => option.value === draft.outcome)?.label || draft.outcome;
    const confirmed = window.confirm([
      "REGISTRAR CONFERÊNCIA MANUAL DO COMANDO?",
      "",
      `Comando #${command.id} · ${COMMAND_LABELS[command.commandType] || command.commandType}`,
      `Resultado: ${outcomeLabel}`,
      `Fonte direta: ${getCompatecManualVerificationSourceOptions().find((option) => option.value === draft.verificationSource)?.label || draft.verificationSource}`,
      `Estado observado: ${draft.observedState}`,
      `Referência: ${draft.evidenceReference.trim()}`,
      `Como foi conferido: ${draft.verificationMethod.trim()}`,
      `Detalhes: ${draft.details.trim()}`,
      "",
      draft.outcome === "not_applied"
        ? "Só registre não aplicado se a fonte direta comprovar que a ação não ocorreu e o estado observado for compatível. Não basta o tempo decorrido. Nenhum quadro será transmitido."
        : draft.outcome === "applied" || draft.outcome === "partial"
          ? "Este registro documenta a aplicação e NÃO bloqueia novas solicitações. Nenhum quadro será transmitido; a conferência final é opcional."
          : "Esta conferência encerra a auditoria do comando, mas não transmite nem repete quadros físicos.",
    ].join("\n"));
    if (!confirmed) return;
    reconcile.mutate({
      commandId: command.id,
      outcome: draft.outcome,
      verificationMethod: draft.verificationMethod.trim(),
      details: draft.details.trim(),
      verificationSource: draft.verificationSource as "panel_event_history" | "official_app_command_history" | "other_direct_record" | "external_report",
      observedState: draft.observedState as "armed" | "disarmed" | "zone_isolated" | "zone_normal" | "all_targets_applied" | "all_targets_unchanged" | "some_targets_changed" | "query_verified" | "unavailable",
      evidenceReference: draft.evidenceReference.trim(),
    });
  }

  return <section aria-label="Conferência manual de comandos Compatec" className="mt-4 space-y-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
    <div>
      <h5 className="text-sm font-bold text-amber-100">Comando sem resultado confirmado</h5>
      <p className="mt-1 text-xs leading-relaxed text-amber-50/90">Estes comandos <strong>não bloqueiam novas solicitações</strong>. O sistema também não reenviará a solicitação antiga. Registre a conferência quando possível, com uma referência técnica direta, para encerrar a auditoria. Relato externo ou o simples tempo decorrido não comprova aplicação nem não aplicação. A conferência registra operador e horário, não é confirmação eletrônica e não transmite quadros.</p>
    </div>
    {query.isLoading ? <p role="status" className="text-xs">Consultando comandos que aguardam conferência…</p>
      : query.error ? <div role="alert" className="text-xs text-red-100">Não foi possível carregar as conferências pendentes. Tente atualizar o histórico.</div>
        : <div className="space-y-3">
          {commands.map((command) => {
            const draft = drafts[command.id] || { ...EMPTY_DRAFT };
            const applicationPending = isManualCompatecApplication(command.responsePayload);
            const options = getCompatecReconciliationOptions(command.commandType, applicationPending);
            const observedOptions = getCompatecManualObservedStateOptions(command.commandType, draft.outcome);
            const cannotSubmit = reconcile.isPending || !draft.outcome || draft.verificationMethod.trim().length < 5
              || draft.details.trim().length < 5 || !draft.verificationSource || draft.verificationSource === "external_report"
              || !draft.observedState || draft.evidenceReference.trim().length < 5;
            return <article key={command.id} className="space-y-2 rounded-md border border-red-300/30 bg-black/20 p-3">
              <div>
                <p className="text-xs font-bold text-red-100">#{command.id} · {COMMAND_LABELS[command.commandType] || command.commandType}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Executado por {command.operatorName || "operador"} · {formatDate(command.createdAt)}{command.incidentId ? ` · ocorrência #${command.incidentId}` : ""}</p>
                <p className="mt-1 text-xs text-foreground">{commandSummary(command)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Motivo: {command.reason}</p>
                {applicationPending && <p role="alert" className="mt-2 rounded border border-amber-300/40 bg-amber-400/10 p-2 text-xs leading-relaxed text-amber-50">A aplicação já foi registrada em uma conferência anterior. Registre a conferência final para encerrar a auditoria; isso não bloqueia novas solicitações.</p>}
              </div>
              <label className="block text-xs font-medium text-foreground">Resultado observado
                <select aria-label={`Resultado da conferência do comando ${command.id}`} value={draft.outcome} disabled={reconcile.isPending} onChange={(event) => updateDraft(command.id, "outcome", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-foreground">
                  <option value="">Selecione…</option>
                  {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {draft.outcome === "not_applied" && <p role="alert" className="rounded border border-amber-300/40 bg-amber-400/10 p-2 text-xs leading-relaxed text-amber-50">Só escolha “não aplicado” com registro técnico direto que mostre o estado oposto ao solicitado. O comando será cancelado para auditoria; nenhum quadro será transmitido.</p>}
              {draft.outcome === "applied" && <p role="alert" className="rounded border border-amber-300/40 bg-amber-400/10 p-2 text-xs leading-relaxed text-amber-50">A aplicação fica registrada para auditoria e não mantém bloqueio. Nenhuma transmissão será feita; se necessário, registre depois a conferência do estado final.</p>}
              <label className="block text-xs font-medium text-foreground">Fonte da conferência
                <select aria-label={`Fonte da conferência do comando ${command.id}`} value={draft.verificationSource} disabled={reconcile.isPending} onChange={(event) => updateDraft(command.id, "verificationSource", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-foreground">
                  <option value="">Selecione…</option>
                  {getCompatecManualVerificationSourceOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {draft.verificationSource === "external_report" && <p role="alert" className="text-xs text-amber-100">Relato externo é identificado separadamente e não libera nem conclui a reconciliação.</p>}
              <label className="block text-xs font-medium text-foreground">Estado observado
                <select aria-label={`Estado observado no comando ${command.id}`} value={draft.observedState} disabled={reconcile.isPending || !draft.outcome} onChange={(event) => updateDraft(command.id, "observedState", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-foreground">
                  <option value="">Selecione…</option>
                  {observedOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-foreground">Referência verificável do registro
                <input aria-label={`Referência da evidência do comando ${command.id}`} value={draft.evidenceReference} maxLength={160} disabled={reconcile.isPending} onChange={(event) => updateDraft(command.id, "evidenceReference", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Ex.: evento #12345 ou registro do app 22/11/2026 02:10" />
              </label>
              <label className="block text-xs font-medium text-foreground">Como conferiu
                <input aria-label={`Método de conferência do comando ${command.id}`} value={draft.verificationMethod} maxLength={255} disabled={reconcile.isPending} onChange={(event) => updateDraft(command.id, "verificationMethod", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Ex.: conferido no aplicativo oficial, histórico consultado" />
              </label>
              <label className="block text-xs font-medium text-foreground">Detalhes da conferência
                <Textarea aria-label={`Detalhes da conferência do comando ${command.id}`} value={draft.details} maxLength={2000} disabled={reconcile.isPending} onChange={(event) => updateDraft(command.id, "details", event.target.value)} className="mt-1 min-h-16" placeholder="Descreva o estado observado e qualquer diferença." />
              </label>
              <Button type="button" size="sm" variant="outline" className="w-full border-red-300/40 text-red-50" disabled={cannotSubmit} onClick={() => submit(command, draft)}>
                {reconcile.isPending ? "Registrando conferência…" : releaseButtonLabel(draft.outcome)}
              </Button>
            </article>;
          })}
        </div>}
  </section>;
}
