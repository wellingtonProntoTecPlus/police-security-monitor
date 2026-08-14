import { describe, expect, it } from "vitest";
import { calculateKeepAliveCutoffMs, getKeepAliveConnectionStatus } from "./keepAliveStatus";

describe("status de conexão por Keep Alive", () => {
  it("calcula uma janela de três minutos para a Compatec que transmite a cada minuto", () => {
    expect(calculateKeepAliveCutoffMs([60_200, 60_200, 60_200])).toBe(180_600);
  });

  it("acomoda os intervalos alternados do F7 da Vetti", () => {
    const cutoff = calculateKeepAliveCutoffMs([11_500, 57_000, 12_000, 57_000, 151_400]);
    expect(cutoff).toBe(227_100);
  });

  it("respeita o prazo individual definido para uma central", () => {
    const now = new Date("2026-08-14T03:00:00.000Z");
    const result = getKeepAliveConnectionStatus({
      lastKeepAliveAt: new Date("2026-08-14T02:10:01.000Z"),
      configuredOfflineAfterMinutes: 60,
      now,
    });

    expect(result.cutoffMs).toBe(60 * 60 * 1000);
    expect(result.connectionStatus).toBe("online");
  });

  it("usa somente o último Keep Alive para distinguir Online de Offline", () => {
    const now = new Date("2026-08-14T03:00:00.000Z");
    const intervals = [60_000, 60_000, 60_000];

    expect(getKeepAliveConnectionStatus({
      lastKeepAliveAt: new Date("2026-08-14T02:57:00.000Z"),
      intervals,
      now,
    }).connectionStatus).toBe("online");
    expect(getKeepAliveConnectionStatus({
      lastKeepAliveAt: new Date("2026-08-14T02:56:59.000Z"),
      intervals,
      now,
    }).connectionStatus).toBe("offline");
  });
});
