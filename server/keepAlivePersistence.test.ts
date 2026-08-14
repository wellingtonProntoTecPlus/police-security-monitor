import { afterEach, describe, expect, it } from "vitest";
import { recordSystemKeepAlive, setDbForTesting } from "./db";

describe("persistência de Keep Alive", () => {
  afterEach(() => setDbForTesting(null));

  it("atualiza o último contato e grava a amostra com intervalo medido", async () => {
    const updates: unknown[] = [];
    const samples: unknown[] = [];
    const previous = new Date("2026-08-13T12:00:00.000Z");
    const fakeDb: any = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 17, brand: "VETTI", lastKeepAliveAt: previous }] }) }) }),
      update: () => ({ set: (values: unknown) => ({ where: async () => updates.push(values) }) }),
      insert: () => ({ values: async (values: unknown) => samples.push(values) }),
    };
    setDbForTesting(fakeDb);

    await recordSystemKeepAlive(17, new Date("2026-08-13T12:00:30.000Z"));

    expect(updates[0]).toMatchObject({ isOnline: true, lastKeepAliveIntervalMs: 30_000 });
    expect(samples[0]).toMatchObject({ alarmSystemId: 17, brand: "VETTI", intervalMs: 30_000 });
  });

  it("não usa um evento comum como referência do intervalo de Keep Alive", async () => {
    const samples: any[] = [];
    const fakeDb: any = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{
        id: 17,
        brand: "RADIOENGE",
        lastKeepAliveAt: new Date("2026-08-13T12:00:00.000Z"),
        lastCommunication: new Date("2026-08-13T12:00:25.000Z"),
      }] }) }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      insert: () => ({ values: async (values: unknown) => samples.push(values) }),
    };
    setDbForTesting(fakeDb);

    await recordSystemKeepAlive(17, new Date("2026-08-13T12:00:30.000Z"));

    expect(samples[0].intervalMs).toBe(30_000);
  });
});
