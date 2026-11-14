import { afterEach, describe, expect, it } from "vitest";
import { recordSystemKeepAlive, setDbForTesting } from "./db";

function makeKeepAliveFakeDb(system: Record<string, unknown>, updates: unknown[], samples: unknown[]) {
  const fakeDb: any = {
    transaction: async (work: (tx: any) => Promise<unknown>) => work(fakeDb),
    select: () => {
      let hasJoinedClient = false;
      const query: any = {
        from: () => query,
        innerJoin: () => { hasJoinedClient = true; return query; },
        leftJoin: () => query,
        where: () => query,
        orderBy: () => query,
        for: () => query,
        limit: async () => hasJoinedClient ? [{ system }] : [],
        then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve([]).then(resolve, reject),
      };
      return query;
    },
    update: () => ({ set: (values: unknown) => ({ where: async () => updates.push(values) }) }),
    insert: () => ({ values: async (values: unknown) => samples.push(values) }),
  };
  return fakeDb;
}

describe("persistência de Keep Alive", () => {
  afterEach(() => setDbForTesting(null));

  it("atualiza o último contato e grava a amostra com intervalo medido", async () => {
    const updates: unknown[] = [];
    const samples: unknown[] = [];
    const previous = new Date("2026-08-13T12:00:00.000Z");
    const fakeDb = makeKeepAliveFakeDb({ id: 17, brand: "VETTI", lastKeepAliveAt: previous }, updates, samples);
    setDbForTesting(fakeDb);

    await recordSystemKeepAlive(17, new Date("2026-08-13T12:00:30.000Z"));

    expect(updates[0]).toMatchObject({ isOnline: true, lastKeepAliveIntervalMs: 30_000 });
    expect(samples[0]).toMatchObject({ alarmSystemId: 17, brand: "VETTI", intervalMs: 30_000 });
  });

  it("não usa um evento comum como referência do intervalo de Keep Alive", async () => {
    const samples: any[] = [];
    const fakeDb = makeKeepAliveFakeDb({
      id: 17,
      brand: "RADIOENGE",
      lastKeepAliveAt: new Date("2026-08-13T12:00:00.000Z"),
      lastCommunication: new Date("2026-08-13T12:00:25.000Z"),
    }, [], samples);
    setDbForTesting(fakeDb);

    await recordSystemKeepAlive(17, new Date("2026-08-13T12:00:30.000Z"));

    expect(samples[0].intervalMs).toBe(30_000);
  });

  it("preserva um intervalo longo após uma central ficar semanas desconectada", async () => {
    const updates: any[] = [];
    const samples: any[] = [];
    const fakeDb = makeKeepAliveFakeDb({
      id: 1,
      brand: "COMPATEC",
      lastKeepAliveAt: new Date("2026-09-04T03:46:15.000Z"),
    }, updates, samples);
    setDbForTesting(fakeDb);

    await recordSystemKeepAlive(1, new Date("2026-10-29T03:55:09.000Z"));

    expect(updates[0].lastKeepAliveIntervalMs).toBeGreaterThan(2_147_483_647);
    expect(samples[0].intervalMs).toBe(updates[0].lastKeepAliveIntervalMs);
  });
});
