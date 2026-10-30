import { describe, expect, it } from "vitest";
import {
  getRadioengeKeepAliveObservationUntil,
  isRadioengeKeepAliveFailure,
  isRadioengeKeepAliveRestoration,
  isRadioengeObservationWithinWindow,
  RADIOENGE_KEEP_ALIVE_ESCALATION_SECONDS,
  RADIOENGE_KEEP_ALIVE_MAX_INTERVAL_SECONDS,
} from "./radioengeKeepAlivePolicy";

describe("política de supervisão E361/R361 Radioenge", () => {
  it("reconhece somente E361 e R361 da Radioenge", () => {
    expect(isRadioengeKeepAliveFailure({ brand: "Radioenge", qualifier: "E", eventCode: "361" })).toBe(true);
    expect(isRadioengeKeepAliveRestoration({ brand: "RADIOENGE", qualifier: "R", eventCode: "361" })).toBe(true);
    expect(isRadioengeKeepAliveFailure({ brand: "JFL", qualifier: "E", eventCode: "361" })).toBe(false);
    expect(isRadioengeKeepAliveRestoration({ brand: "RADIOENGE", qualifier: "E", eventCode: "361" })).toBe(false);
    expect(isRadioengeKeepAliveFailure({ brand: "RADIOENGE", qualifier: "E", eventCode: "365" })).toBe(false);
  });

  it("usa o dobro do intervalo máximo observado como prazo de escalada", () => {
    expect(RADIOENGE_KEEP_ALIVE_MAX_INTERVAL_SECONDS).toBe(2);
    expect(RADIOENGE_KEEP_ALIVE_ESCALATION_SECONDS).toBe(4);
    const receivedAt = new Date("2026-10-30T02:00:00.000Z");
    const until = getRadioengeKeepAliveObservationUntil(receivedAt);
    expect(until.toISOString()).toBe("2026-10-30T02:00:04.000Z");
    expect(isRadioengeObservationWithinWindow(until, new Date("2026-10-30T02:00:03.999Z"))).toBe(true);
    expect(isRadioengeObservationWithinWindow(until, new Date("2026-10-30T02:00:04.000Z"))).toBe(false);
  });
});
