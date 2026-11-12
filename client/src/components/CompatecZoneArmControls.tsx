import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

/** As chaves são intenções persistidas, nunca comandos físicos de inibição avulsa. */
export default function CompatecZoneArmControls({ alarmSystemId }: { alarmSystemId: number }) {
  const utils = trpc.useUtils();
  const [now, setNow] = useState(Date.now());
  const zones = trpc.alarmZone.list.useQuery({ alarmSystemId }, { retry: false });
  const selections = trpc.remoteCommand.compatecZoneSelections.useQuery({ alarmSystemId }, {
    refetchInterval: 3000, refetchOnWindowFocus: true, retry: false,
  });
  const selection = trpc.remoteCommand.selectCompatecZoneForArm.useMutation({
    onSuccess: async () => {
      setNow(Date.now());
      await utils.remoteCommand.compatecZoneSelections.invalidate({ alarmSystemId });
    },
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => {
    const expiries = (selections.data || []).filter((item) => !item.armCommandId)
      .map((item) => new Date(item.expiresAt).getTime()).filter((expiry) => expiry > Date.now());
    if (!expiries.length) return;
    // Apenas atualiza apresentação; o servidor decide a validade mesmo se a aba fechar.
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...expiries) - Date.now()) + 10);
    return () => window.clearTimeout(timer);
  }, [selections.data, now, alarmSystemId]);

  if (zones.isLoading || selections.isLoading) return <p className="text-xs text-muted-foreground">Carregando zonas...</p>;
  if (zones.error || selections.error) return <p role="alert" className="text-xs text-amber-200">Não foi possível consultar as zonas. As chaves estão bloqueadas.</p>;
  const availableZones = (zones.data || []).filter((zone) => zone.isActive && zone.zoneNumber >= 1 && zone.zoneNumber <= 23);
  return (
    <section aria-label="Zonas para inibir no próximo Arme" className="space-y-2 rounded-lg border border-amber-400/25 bg-amber-500/5 p-3">
      <h4 className="text-sm font-semibold text-foreground">Zonas / setores — Inibir no Arme</h4>
      <p className="text-xs leading-relaxed text-muted-foreground">Marque a zona e inicie ARMAR em até 1 minuto. A chave sozinha não envia comando; se desistir, ela volta ao normal sem mensagem.</p>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {availableZones.map((zone) => {
          const selected = (selections.data || []).find((item) => item.zoneNumber === zone.zoneNumber && (item.armCommandId || new Date(item.expiresAt).getTime() > Math.max(now, Date.now())));
          return (
            <div key={zone.id} className="flex items-center justify-between gap-3 rounded bg-black/20 px-2.5 py-2 text-xs">
              <div><strong className="font-mono">Zona {zone.zoneNumber}</strong> · {zone.name}
                {selected?.armCommandId && <p className="mt-1 text-[10px] text-amber-200">Solicitada no Arme #{selected.armCommandId} · aguarda Desarme</p>}
              </div>
              <label className="flex shrink-0 items-center gap-2"><span>Inibir</span>
                <Switch aria-label={`Inibir zona ${zone.zoneNumber}`} checked={Boolean(selected)} disabled={selection.isPending || Boolean(selected?.armCommandId)}
                  onCheckedChange={(checked) => selection.mutate({ alarmSystemId, zoneNumber: zone.zoneNumber, selected: checked })} />
              </label>
            </div>
          );
        })}
        {!availableZones.length && <p className="text-xs text-muted-foreground">Nenhuma zona ativa (1–23) cadastrada.</p>}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">Após o Desarme confirmado, as chaves ficam disponíveis novamente. KA1 é recebimento, não confirmação individual do bypass.</p>
    </section>
  );
}
