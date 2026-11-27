import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { CompatecZoneConfigurationChange } from "@shared/compatecZoneConfiguration";
import { getCompatecConnectionIdentity } from "@shared/compatecConnectionIdentity";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type CompatecZoneConfigurationPanelProps = {
  alarmSystemId: number;
  incidentId?: number;
  leaseToken?: string;
  standalone?: boolean;
  isVisible?: boolean;
  reasonValue?: string;
  onReasonValueChange?: (value: string) => void;
  onSubmitted?: () => void;
  account: string;
  model?: string | null;
  macAddress?: string | null;
  imeiGprs?: string | null;
  receiverPort?: number | null;
  canOperate: boolean;
};

type ZoneDraft = { armState?: "armed" | "disarmed"; bypassState?: "annulled" | "restored" };

export default function CompatecZoneConfigurationPanel(props: CompatecZoneConfigurationPanelProps) {
  const { alarmSystemId, incidentId, leaseToken, standalone = false, isVisible = true, reasonValue, onReasonValueChange, onSubmitted, account, model, macAddress, imeiGprs, receiverPort, canOperate } = props;
  const zonesQuery = trpc.alarmZone.list.useQuery({ alarmSystemId }, { enabled: Boolean(alarmSystemId) && isVisible, retry: false });
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<number, ZoneDraft>>({});
  const [internalReason, setInternalReason] = useState("");
  const reason = reasonValue ?? internalReason;
  const setReason = onReasonValueChange ?? setInternalReason;
  const finishConfiguration = async (result: { status: string; message?: string }, isStandalone: boolean) => {
      await Promise.all([
        utils.remoteCommand.list.invalidate({ alarmSystemId, limit: 8 }),
        isStandalone ? utils.dashboard.armDisarmStatus.invalidate() : utils.incident.openQueue.invalidate(),
      ]);
      setDrafts({});
      setReason("");
      if (isStandalone) onSubmitted?.();
      if (result.status === "sent") {
        toast.success("Alterações enviadas à central. Confira o estado final dos setores no painel.", { duration: 12_000 });
      } else if (result.status === "failed" || result.status === "dispatch_unknown") {
        const detail = result.message || "Não foi possível confirmar o resultado. Confira o histórico.";
        toast.error(detail.includes("nova tentativa") ? detail : `${detail} Você já pode solicitar novamente.`, { duration: 12_000 });
      } else {
        toast.warning(result.message || "Confira o histórico antes de fazer outra solicitação.", { duration: 12_000 });
      }
  };
  const incidentConfigure = trpc.remoteCommand.configureCompatecZones.useMutation({
    onSuccess: (result) => finishConfiguration(result, false),
    onError: (error) => toast.error(error.message),
  });
  const standaloneConfigure = trpc.remoteCommand.configureCompatecZonesStandalone.useMutation({
    onSuccess: (result) => finishConfiguration(result, true),
    onError: (error) => toast.error(error.message),
  });
  const configure = standalone ? standaloneConfigure : incidentConfigure;

  const activeZones = (zonesQuery.data || [])
    .filter((zone) => zone.isActive && zone.zoneNumber >= 1 && zone.zoneNumber <= 23)
    .sort((left, right) => left.zoneNumber - right.zoneNumber);
  const zoneChanges = useMemo<CompatecZoneConfigurationChange[]>(() => Object.entries(drafts)
    .map(([zone, draft]) => ({ zoneNumber: Number(zone), ...draft }))
    .filter((change) => change.armState !== undefined || change.bypassState !== undefined)
    .sort((left, right) => left.zoneNumber - right.zoneNumber), [drafts]);

  const identityAndPortReady = Boolean(getCompatecConnectionIdentity({ macAddress, imeiGprs, receiverPort }));
  const normalizedReason = reason.trim();
  const hasRequiredPanelAccess = standalone || (Boolean(leaseToken) && Boolean(incidentId));
  const canSubmit = canOperate && hasRequiredPanelAccess && identityAndPortReady
    && zoneChanges.length > 0 && normalizedReason.length >= 5 && !configure.isPending;

  function updateDraft(zoneNumber: number, field: "armState" | "bypassState", value: string) {
    setDrafts((current) => {
      const next = { ...(current[zoneNumber] || {}) };
      if (field === "armState") {
        if (value === "armed" || value === "disarmed") next.armState = value;
        else delete next.armState;
      } else {
        if (value === "annulled" || value === "restored") next.bypassState = value;
        else delete next.bypassState;
      }
      const updated = { ...current };
      if (next.armState === undefined && next.bypassState === undefined) delete updated[zoneNumber];
      else updated[zoneNumber] = next;
      return updated;
    });
  }

  function submitConfiguration() {
    if (!canSubmit || (!standalone && !leaseToken)) return;
    const changeSummary = zoneChanges.map((change) => {
      const zone = activeZones.find((candidate) => candidate.zoneNumber === change.zoneNumber);
      const details = [
        change.armState === "armed" ? "Armar" : change.armState === "disarmed" ? "Desarmar" : null,
        change.bypassState === "annulled" ? "Inibir" : change.bypassState === "restored" ? "Retirar inibição" : null,
      ].filter(Boolean).join(" + ");
      return `Setor ${change.zoneNumber}${zone?.name ? ` · ${zone.name}` : ""}: ${details}`;
    }).join("\n");
    const confirmation = [
      "CONFIRMAR ALTERAÇÕES DOS SETORES?",
      "",
      `Conta ${account} · ${model || "Compatec"}`,
      ...(!standalone ? [`Ocorrência #${incidentId}`] : []),
      `Descrição / motivo: ${normalizedReason}`,
      "",
      changeSummary,
      "",
      "Esta ação altera somente os setores listados. Confira o estado final diretamente na central.",
    ].join("\n");
    if (!window.confirm(confirmation)) return;
    if (standalone) {
      standaloneConfigure.mutate({ alarmSystemId, reason: normalizedReason, zoneChanges });
    } else if (incidentId && leaseToken) {
      incidentConfigure.mutate({ alarmSystemId, incidentId, leaseToken, reason: normalizedReason, zoneChanges });
    }
  }

  return (
    <section aria-label="Comandos de zonas e setores" className="space-y-3 rounded-lg border border-amber-400/30 bg-amber-500/5 p-4">
      <div>
        <h3 className="text-sm font-bold text-amber-100">Comandos de zonas e setores</h3>
        <p className="mt-1 text-xs leading-relaxed text-amber-50/90">
          Selecione os setores para armar, desarmar, inibir ou restaurar. Todas as mudanças ficam em uma solicitação.
        </p>
      </div>

      {zonesQuery.isLoading ? <p className="text-xs text-muted-foreground">Carregando setores...</p>
        : zonesQuery.error ? <p role="alert" className="text-xs text-amber-100">Não foi possível consultar os setores. Nenhum comando será habilitado.</p>
          : activeZones.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum setor ativo cadastrado para esta central.</p>
            : <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {activeZones.map((zone) => (
                <div key={zone.id} className="grid gap-2 rounded-md border border-border/60 bg-black/20 p-2.5 sm:grid-cols-[minmax(100px,1fr)_1fr_1fr] sm:items-center">
                  <div className="min-w-0 text-xs">
                    <strong className="font-mono text-foreground">Setor {String(zone.zoneNumber).padStart(2, "0")}</strong>
                    <span className="ml-2 break-words text-muted-foreground">{zone.name || "Sem nome"}</span>
                  </div>
                  <label className="text-xs text-muted-foreground">Arme do setor
                    <select aria-label={`Estado de arme do setor ${zone.zoneNumber}`} value={drafts[zone.zoneNumber]?.armState || "unchanged"} disabled={!canOperate || configure.isPending} onChange={(event) => updateDraft(zone.zoneNumber, "armState", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-foreground">
                      <option value="unchanged">Sem alteração</option><option value="armed">Armar</option><option value="disarmed">Desarmar</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">Inibição
                    <select aria-label={`Inibição do setor ${zone.zoneNumber}`} value={drafts[zone.zoneNumber]?.bypassState || "unchanged"} disabled={!canOperate || configure.isPending} onChange={(event) => updateDraft(zone.zoneNumber, "bypassState", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-foreground">
                      <option value="unchanged">Sem alteração</option><option value="annulled">Inibir</option><option value="restored">Retirar inibição</option>
                    </select>
                  </label>
                </div>
              ))}
      </div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-foreground sm:col-span-2">Descrição / motivo (mínimo 5 caracteres)
          <Textarea aria-label="Descrição / motivo da configuração de setores (mínimo 5 caracteres)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} disabled={!canOperate || configure.isPending} className="mt-1 min-h-16" placeholder="Descreva brevemente o motivo da solicitação." />
        </label>
      </div>

      {normalizedReason.length < 5 && <p className="text-xs text-amber-200">Digite um motivo com pelo menos 5 caracteres para liberar a confirmação.</p>}
      {!identityAndPortReady && <p role="alert" className="text-xs text-red-200">Comando indisponível: identificação da central incompleta. Solicite ajuda ao supervisor.</p>}
      {!standalone && !leaseToken && <p role="alert" className="text-xs text-amber-100">Abra ou assuma o atendimento para habilitar os comandos de setores.</p>}
      <Button type="button" className="w-full border border-amber-300/50 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30" disabled={!canSubmit} onClick={submitConfiguration}>
        {configure.isPending ? "Enviando alterações..." : `Aplicar alterações${zoneChanges.length ? ` · ${zoneChanges.length} setor(es)` : ""}`}
      </Button>
    </section>
  );
}
