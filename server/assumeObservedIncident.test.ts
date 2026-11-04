import { afterEach, describe, expect, it, vi } from "vitest";
import { assumeObservedIncident, createOccurrenceAndCloseIncident, setDbForTesting } from "./db";
import { incidentHistory, incidents, occurrences, users } from "../drizzle/schema";

function makeMockDb(options: { parent?: Record<string, any>; activeChild?: Record<string, any> | null } = {}) {
  const parent = options.parent || {
    id: 880,
    eventId: 321,
    parentIncidentId: null,
    alarmSystemId: 44,
    clientId: 55,
    operatorId: 12,
    status: "observing",
    version: 7,
    claimedAt: new Date("2026-11-04T10:00:00Z"),
    observationUntil: new Date("2026-11-04T12:30:00Z"),
    notes: "Tático enviado; aguarda verificação.",
    priority: "high",
  };
  let selectCall = 0;
  const select = vi.fn(() => {
    const call = selectCall++;
    const rows = call === 0 ? [parent] : call === 1 ? (options.activeChild ? [options.activeChild] : []) : [{ name: "Operadora Ana" }];
    const builder: any = {
      from: vi.fn(() => builder),
      where: vi.fn(() => builder),
      for: vi.fn(() => builder),
      limit: vi.fn(async () => rows),
    };
    return builder;
  });
  const updates: any[] = [];
  const update = vi.fn(() => ({
    set: vi.fn((values) => {
      updates.push(values);
      return { where: vi.fn(async () => [{ affectedRows: 1 }]) };
    }),
  }));
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const insert = vi.fn((table) => ({ values: vi.fn(async (values) => { inserts.push({ table, values }); return [{ insertId: 1 }]; }) }));
  const tx = { select, update, insert };
  const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
  return { db, tx, updates, inserts };
}

function makeLifecycleDb() {
  const current: Record<string, any> = {
    id: 880, eventId: 321, parentIncidentId: null, alarmSystemId: 44, clientId: 55,
    operatorId: 12, status: "observing", version: 7, claimedAt: new Date("2026-11-04T10:00:00Z"),
    observationUntil: new Date("2026-11-04T12:30:00Z"), notes: "Tático enviado; aguarda verificação.",
    priority: "high", createdAt: new Date("2026-11-04T09:30:00Z"),
  };
  const inserted: Array<{ table: unknown; values: any }> = [];
  let selectCall = 0;
  const select = vi.fn(() => {
    const call = selectCall++;
    const builder: any = {
      from: vi.fn((table: unknown) => {
        builder.table = table;
        return builder;
      }),
      where: vi.fn(() => builder),
      for: vi.fn(() => builder),
      limit: vi.fn(async () => call === 1 ? [] : call === 2 ? [{ name: "Operadora Ana" }] : [current]),
      table: null as unknown,
    };
    return builder;
  });
  const update = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(async () => { Object.assign(current, values); return [{ affectedRows: 1 }]; }),
    })),
  }));
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn(async (values: any) => {
      inserted.push({ table, values });
      return [{ insertId: table === occurrences ? 999 : 1000 }];
    }),
  }));
  const tx = { select, update, insert };
  const db = { transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
  return { db, current, tx, inserted };
}

describe("assumir atendimento em observação", () => {
  afterEach(() => setDbForTesting(null));

  it("transfere a mesma ocorrência, remove observação, mantém o histórico e não cria incidente filho", async () => {
    const mock = makeMockDb();
    setDbForTesting(mock.db as any);

    const result = await assumeObservedIncident({ incidentId: 880, operatorId: 13, operatorName: "Operador Bruno" });

    expect(result).toMatchObject({
      id: 880,
      eventId: 321,
      parentIncidentId: null,
      status: "attending",
      operatorId: 13,
      operatorName: "Operador Bruno",
      transferred: true,
      previousOperatorId: 12,
      previousOperatorName: "Operadora Ana",
    });
    expect(mock.updates).toHaveLength(1);
    expect(mock.updates[0]).toMatchObject({ status: "attending", operatorId: 13, observationUntil: null, version: 8 });
    expect(result.notes).toContain("Tático enviado; aguarda verificação.");
    expect(result.notes).toContain("Atendimento assumido por Operador Bruno");
    expect(mock.tx.insert).toHaveBeenCalledTimes(1);
    expect(mock.inserts[0].table).toBe(incidentHistory);
    expect(mock.inserts[0].values).toMatchObject({
      incidentId: 880,
      parentIncidentId: null,
      operatorId: 13,
      operatorName: "Operador Bruno",
      action: "assumed",
      statusBefore: "observing",
      statusAfter: "attending",
      note: expect.stringContaining("responsabilidade transferida de Operadora Ana"),
    });
  });

  it("não transfere nem duplica quando há um atendimento filho legado ainda ativo", async () => {
    const mock = makeMockDb({ activeChild: { id: 881, operatorId: 14 } });
    setDbForTesting(mock.db as any);

    await expect(assumeObservedIncident({ incidentId: 880, operatorId: 13, operatorName: "Operador Bruno" }))
      .rejects.toThrow("atendimento legado ativo (#881)");
    expect(mock.tx.update).not.toHaveBeenCalled();
    expect(mock.tx.insert).not.toHaveBeenCalled();
  });

  it("recusa transferência silenciosa de atendimento que já não esteja em observação", async () => {
    const mock = makeMockDb({ parent: { id: 880, eventId: 321, parentIncidentId: null, alarmSystemId: 44, clientId: 55, operatorId: 12, status: "attending", version: 7, notes: "Em atendimento" } });
    setDbForTesting(mock.db as any);

    await expect(assumeObservedIncident({ incidentId: 880, operatorId: 13, operatorName: "Operador Bruno" }))
      .rejects.toThrow("Só é possível assumir um atendimento em observação");
    expect(mock.tx.update).not.toHaveBeenCalled();
    expect(mock.tx.insert).not.toHaveBeenCalled();
  });

  it("permite ao operador que assumiu finalizar e salvar o relatório no mesmo ID", async () => {
    const mock = makeLifecycleDb();
    setDbForTesting(mock.db as any);

    const assumed = await assumeObservedIncident({ incidentId: 880, operatorId: 13, operatorName: "Operador Bruno" });
    const report = await createOccurrenceAndCloseIncident(assumed.id, {
      incidentId: assumed.id,
      account: "0044",
      eventCode: "130",
      qualifier: "E",
      description: "Alarme de zona",
      observations: "Tático chegou e não identificou violação.",
    } as any, 13, "Operador Bruno");

    expect(assumed.id).toBe(880);
    expect(assumed.operatorId).toBe(13);
    expect(report.id).toBe(999);
    expect(mock.current).toMatchObject({ id: 880, status: "closed", operatorId: 13 });
    expect(mock.inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: occurrences, values: expect.objectContaining({ incidentId: 880, operatorId: 13, operatorName: "Operador Bruno" }) }),
      expect.objectContaining({ table: incidentHistory, values: expect.objectContaining({ incidentId: 880, action: "finalized", operatorId: 13 }) }),
    ]));
    expect(mock.inserted.some((entry) => entry.table === incidents)).toBe(false);
    expect(mock.inserted.filter((entry) => entry.table === incidentHistory).map((entry) => entry.values.action)).toEqual(["assumed", "finalized"]);
  });
});
