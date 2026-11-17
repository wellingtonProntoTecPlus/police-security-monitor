import { useMemo, useState } from "react";
import { toast } from "sonner";
import { buildCompatecZoneConfigurationFrames, type CompatecZoneConfigurationChange } from "@shared/compatecZoneConfiguration";
import { getCompatecConnectionIdentity } from "@shared/compatecConnectionIdentity";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type CompatecZoneConfigurationPanelProps = {
  alarmSystemId: number;
  incidentId: number;
  leaseToken?: string;
  account: string;
  model?: string | null;
  macAddress?: string | null;
  imeiGprs?: string | null;
  receiverPort?: number | null;
  canOperate: boolean;
};

type ZoneDraft = { armState?: "armed" | "disarmed"; bypassState?: "annulled" | "restored" };

export default function CompatecZoneConfigurationPanel(props: CompatecZoneConfigurationPanelProps) {
  const { alarmSystemId, incidentId, leaseToken, account, model, macAddress, imeiGprs, receiverPort, canOperate } = props;
  const zonesQuery = trpc.alarmZone.list.useQuery({ alarmSystemId }, { enabled: Boolean(alarmSystemId), retry: false });
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<number, ZoneDraft>>({});
  const [requestedBy, setRequestedBy] = useState("");
  const [reason, setReason] = useState("");
  const configure = trpc.remoteCommand.configureCompatecZones.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.remoteCommand.list.invalidate({ alarmSystemId, limit: 8 }),
        utils.incident.openQueue.invalidate(),
      ]);
      setDrafts({});
      setRequestedBy("");
      setReason("");
      if (result.status === "sent") {
        toast.info("AK2→AK1 enviados. KA1 confirma recebimento, não os estados finais dos setores. Nenhum AK4 foi enviado.", { duration: 12_000 });
      } else if (result.status === "failed" || result.status === "dispatch_unknown") {
        toast.error(result.message || "A ação não foi concluída. Confira o histórico e o estado da central; não reenvie automaticamente.", { duration: 12_000 });
      } else {
        toast.warning(result.message || "Confira o histórico do comando antes de qualquer nova solicitação.", { duration: 12_000 });
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const activeZones = (zonesQuery.data || [])
    .filter((zone) => zone.isActive && zone.zoneNumber >= 1 && zone.zoneNumber <= 23)
    .sort((left, right) => left.zoneNumber - right.zoneNumber);
  const zoneChanges = useMemo<CompatecZoneConfigurationChange[]>(() => Object.entries(drafts)
    .map(([zone, draft]) => ({ zoneNumber: Number(zone), ...draft }))
    .filter((change) => change.armState !== undefined || change.bypassState !== undefined)
    .sort((left, right) => left.zoneNumber - right.zoneNumber), [drafts]);
  const frames = useMemo(() => {
    if (!zoneChanges.length) return [];
    try { return buildCompatecZoneConfigurationFrames(zoneChanges); }
    catch { return []; }
  }, [zoneChanges]);

  const connectionIdentity = getCompatecConnectionIdentity({ macAddress, imeiGprs, receiverPort });
  const physicalIdentifier = connectionIdentity
    ? (connectionIdentity.identifierType === "mac_ascii" ? "MAC " : "IMEI ") + connectionIdentity.identifier
    : "";
  const normalizedRequester = requestedBy.trim();
  const normalizedReason = reason.trim();
  const identityAndPortReady = Boolean(connectionIdentity);
  const canSubmit = canOperate && Boolean(leaseToken) && Boolean(incidentId) && identityAndPortReady
    && zoneChanges.length > 0 && normalizedRequester.length >= 2 && normalizedReason.length >= 5 && !configure.isPending;

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
    if (!canSubmit || !leaseToken) return;
    const changeSummary = zoneChanges.map((change) => {
      const zone = activeZones.find((candidate) => candidate.zoneNumber === change.zoneNumber);
      const details = [
        change.armState === "armed" ? "Armar" : change.armState === "disarmed" ? "Desarmar" : null,
        change.bypassState === "annulled" ? "Anular" : change.bypassState === "restored" ? "Retirar anulação" : null,
      ].filter(Boolean).join(" + ");
      return `Setor ${change.zoneNumber}${zone?.name ? ` · ${zone.name}` : ""}: ${details}`;
    }).join("\n");
    const confirmation = [
      "CONFIRMAR CONFIGURAÇÃO DE SETORES COM A COMPATEC?",
      "",
      `Conta ${account} · ${model || "Compatec"}`,
      `Identidade física: ${physicalIdentifier} · Porta do receptor ${receiverPort}`,
      `Ocorrência #${incidentId}`,
      `Operador autenticado: esta sessão` ,
      `Solicitado por: ${normalizedRequester}`,
      `Motivo: ${normalizedReason}`,
      "",
      changeSummary,
      "",
      "Quadros exatos (somente AK2→AK1):",
      ...frames.map((frame) => frame.trim()),
      "",
      "A resposta esperada é KA1: recebimento apenas, não confirmação do estado final. Esta ação não envia AK4.",
    ].join("\n");
    if (!window.confirm(confirmation)) return;
    configure.mutate({
      alarmSystemId,
      incidentId,
      leaseToken,
      requestedBy: normalizedRequester,
      reason: normalizedReason,
      zoneChanges,
    });
  }

  return (
    <section aria-label="Configuração de setores Compatec" className="space-y-3 rounded-lg border border-amber-400/30 bg-amber-500/5 p-4">
      <div>
        <h3 className="text-sm font-bold text-amber-100">Configuração de Arme e anulação por setor</h3>
        <p className="mt-1 text-xs leading-relaxed text-amber-50/90">
          Configure quantos setores forem necessários em uma única solicitação. O servidor envia AK2 e depois AK1, conforme a identidade física cadastrada e a porta Compatec. KA1 indica recebimento; não prova o estado final. Não há AK4 nesta ação.
        </p>
      </div>

      {zonesQuery.isLoading ? <p className="text-xs text-muted-foreground">Carregando setores ativos...</p>
        : zonesQuery.error ? <p role="alert" className="text-xs text-amber-100">Não foi possível consultar os setores. Nenhum comando será habilitado.</p>
          : activeZones.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum setor ativo de 1 a 23 está cadastrado para esta central.</p>
            : <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {activeZones.map((zone) => (
                <div key={zone.id} className="grid gap-2 rounded-md border border-border/60 bg-black/20 p-2.5 sm:grid-cols-[minmax(100px,1fr)_1fr_1fr] sm:items-center">
                  <div className="min-w-0 text-xs">
                    <strong className="font-mono text-foreground">Setor {String(zone.zoneNumber).padStart(2, "0")}</strong>
                    <span className="ml-2 break-words text-muted-foreground">{zone.name || "Sem nome"}</span>
                  </div>
                  <label className="text-xs text-muted-foreground">ArmadoSet
                    <select aria-label={`Estado de arme do setor ${zone.zoneNumber}`} value={drafts[zone.zoneNumber]?.armState || "unchanged"} disabled={!canOperate || configure.isPending} onChange={(event) => updateDraft(zone.zoneNumber, "armState", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-foreground">
                      <option value="unchanged">Sem alteração</option><option value="armed">Armado</option><option value="disarmed">Desarmado</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">Anulação
                    <select aria-label={`Anulação do setor ${zone.zoneNumber}`} value={drafts[zone.zoneNumber]?.bypassState || "unchanged"} disabled={!canOperate || configure.isPending} onChange={(event) => updateDraft(zone.zoneNumber, "bypassState", event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-foreground">
                      <option value="unchanged">Sem alteração</option><option value="annulled">Anular</option><option value="restored">Retirar anulação</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>}

      {zoneChanges.length > 0 && <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3" aria-label="Prévia dos quadros AK2 e AK1">
        <p className="text-xs font-semibold text-cyan-100">Prévia exata dos dois quadros</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-cyan-50">{frames.map((frame) => frame.trim()).join("\n")}</pre>
        <p className="mt-1 text-[10px] text-cyan-100">AK2 seleciona campos; AK1 define valores. Não há terceiro quadro AK4.</p>
      </div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-foreground">Solicitado por
          <input aria-label="Solicitado por" value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} maxLength={255} disabled={!canOperate || configure.isPending} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Cliente ou responsável" />
        </label>
        <label className="text-xs font-medium text-foreground sm:col-span-2">Motivo operacional
          <Textarea aria-label="Motivo operacional da configuração de setores" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} disabled={!canOperate || configure.isPending} className="mt-1 min-h-16" placeholder="Descreva a solicitação e o contexto do atendimento." />
        </label>
      </div>

      {!identityAndPortReady && <p role="alert" className="text-xs text-red-200">Comando bloqueado: a Compatec precisa ter MAC ou IMEI de 6 caracteres hexadecimais compatível com o pacote de identidade, mais porta do receptor. Serial/ISEP, conta ou IP isolados não identificam esta conexão.</p>}
      {!leaseToken && <p role="alert" className="text-xs text-amber-100">Abra ou assuma o painel desta ocorrência para habilitar uma ação física.</p>}
      <Button type="button" className="w-full border border-amber-300/50 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30" disabled={!canSubmit} onClick={submitConfiguration}>
        {configure.isPending ? "Registrando configuração..." : `Enviar configuração AK2→AK1${zoneChanges.length ? ` · ${zoneChanges.length} setor(es)` : ""}`}
      </Button>
    </section>
  );
}
