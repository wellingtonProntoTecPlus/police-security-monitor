import { describe, expect, it } from "vitest";
import { formatKeepAliveInterval, measureKeepAlive } from "./keepAliveTracking";

describe("medição de Keep Alive", () => {
  it("mede o primeiro sinal sem inventar um intervalo", () => {
    const measurement = measureKeepAlive(null, new Date("2026-08-13T12:00:00.000Z"));
    expect(measurement.intervalMs).toBeNull();
    expect(formatKeepAliveInterval(measurement.intervalMs)).toBe("primeiro Keep Alive observado");
  });

  it("calcula o intervalo real entre dois sinais", () => {
    const measurement = measureKeepAlive(new Date("2026-08-13T12:00:00.000Z"), new Date("2026-08-13T12:00:30.000Z"));
    expect(measurement.intervalMs).toBe(30_000);
    expect(formatKeepAliveInterval(measurement.intervalMs)).toBe("30.0s desde o Keep Alive anterior");
  });
});
