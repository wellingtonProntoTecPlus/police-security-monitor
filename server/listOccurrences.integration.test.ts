import { describe, expect, it } from "vitest";
import { alarmSystems, clients, occurrences } from "../drizzle/schema";
import { listOccurrencesWithDb } from "./db";
import { persistAutomaticOccurrence } from "./receiver/automaticOccurrencePersistence";

function thenableRows<T>(rows: T[]) {
  const query: any = {
    where: () => query,
    orderBy: () => query,
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

describe("listOccurrences integrado", () => {
  it("retorna cliente e parceira para occurrence automática identificada por sistema", async () => {
    const occurrenceRows = [{
      id: 100, account: "0336", eventCode: "401", systemId: 18, clientId: null, clientName: null, partnerCompanyId: null,
      finalizedAt: new Date("2026-08-13T18:00:00.000Z"),
    }];
    const systemRows = [{ id: 18, clientId: 32 }];
    const clientRows = [{ id: 32, name: "Cliente Vetti", fantasyName: null, partnerCompanyId: 5 }];
    const fakeDb = {
      select: () => ({
        from: (table: unknown) => {
          if (table === occurrences) return thenableRows(occurrenceRows);
          if (table === alarmSystems) return { where: async () => systemRows };
          if (table === clients) return { where: async () => clientRows };
          throw new Error("Tabela não esperada no teste");
        },
      }),
    };

    const rows = await listOccurrencesWithDb(fakeDb, { partnerCompanyId: 5 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 100,
      account: "0336",
      systemId: 18,
      clientId: 32,
      clientName: "Cliente Vetti",
      partnerCompanyId: 5,
    });
  });

  it("persiste um evento automático identificado e o devolve pelo relatório com o cliente", async () => {
    const occurrenceRows: Array<Record<string, unknown>> = [];
    const systemRows = [{ id: 18, clientId: 32 }];
    const clientRows = [{ id: 32, name: "Cliente Vetti", fantasyName: null, partnerCompanyId: 5 }];
    const fakeDb = {
      select: () => ({
        from: (table: unknown) => {
          if (table === occurrences) return thenableRows(occurrenceRows);
          if (table === alarmSystems) return { where: async () => systemRows };
          if (table === clients) return { where: async () => clientRows };
          throw new Error("Tabela não esperada no teste");
        },
      }),
    };

    await persistAutomaticOccurrence({
      occurrence: {
        account: "0336", eventCode: "401", qualifier: "E", description: "Desarme", priority: "medium", brand: "VETTI",
        operatorName: "Sistema", observations: "Finalizada automaticamente", logs: "[]", attendingTimeMs: 0, eventReceivedAt: new Date("2026-08-13T18:00:00.000Z"),
      },
      system: { id: 18, clientId: 32 },
      client: { id: 32, name: "Cliente Vetti", partnerCompanyId: 5 },
      create: async (row) => { occurrenceRows.push({ id: 101, finalizedAt: new Date("2026-08-13T18:00:00.000Z"), ...row }); },
    });

    const rows = await listOccurrencesWithDb(fakeDb, { partnerCompanyId: 5 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 101, account: "0336", systemId: 18, clientId: 32, clientName: "Cliente Vetti", partnerCompanyId: 5,
    });
  });
});
