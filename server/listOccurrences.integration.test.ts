import { describe, expect, it } from "vitest";
import { occurrences } from "../drizzle/schema";
import { listOccurrencesWithDb } from "./db";
import { persistAutomaticOccurrence } from "./receiver/automaticOccurrencePersistence";

function thenableRows<T>(rows: T[], pagination?: { limit?: number; offset?: number }) {
  const query: any = {
    where: () => query,
    orderBy: () => query,
    leftJoin: () => query,
    limit: (value: number) => { if (pagination) pagination.limit = value; return query; },
    offset: (value: number) => { if (pagination) pagination.offset = value; return query; },
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

function fakeOccurrenceDb(rows: Array<Record<string, unknown>>, pagination?: { limit?: number; offset?: number }) {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table !== occurrences) throw new Error("Tabela não esperada no teste");
        return thenableRows(rows, pagination);
      },
    }),
  };
}

describe("listOccurrences integrado", () => {
  it("retorna cliente e parceira para occurrence automática identificada por sistema", async () => {
    const occurrence = {
      id: 100, account: "0336", eventCode: "401", systemId: 18, clientId: null, clientName: null, partnerCompanyId: null,
      finalizedAt: new Date("2026-08-13T18:00:00.000Z"),
    };
    const pagination: { limit?: number; offset?: number } = {};
    const fakeDb = fakeOccurrenceDb([{
      occurrence, linkedClientId: 32, linkedClientName: "Cliente Vetti", linkedFantasyName: null, linkedPartnerCompanyId: 5,
    }], pagination);

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
    expect(pagination).toEqual({ limit: 100, offset: 0 });
  });

  it("preserva paginação pedida pelo relatório e limita o máximo retornado", async () => {
    const pagination: { limit?: number; offset?: number } = {};
    await listOccurrencesWithDb(fakeOccurrenceDb([], pagination), { limit: 25, offset: 40 });
    expect(pagination).toEqual({ limit: 25, offset: 40 });

    await listOccurrencesWithDb(fakeOccurrenceDb([], pagination), { limit: 10000, offset: -5 });
    expect(pagination).toEqual({ limit: 1000, offset: 0 });
  });

  it("persiste um evento automático identificado e o devolve pelo relatório com o cliente", async () => {
    const occurrenceRows: Array<Record<string, unknown>> = [];
    const fakeDb = fakeOccurrenceDb(occurrenceRows.map((occurrence: any) => ({
      occurrence, linkedClientName: "Cliente Vetti", linkedFantasyName: null, linkedPartnerCompanyId: 5,
    })));

    await persistAutomaticOccurrence({
      occurrence: {
        account: "0336", eventCode: "401", qualifier: "E", description: "Desarme", priority: "medium", brand: "VETTI",
        operatorName: "Sistema", observations: "Finalizada automaticamente", logs: "[]", attendingTimeMs: 0, eventReceivedAt: new Date("2026-08-13T18:00:00.000Z"),
      },
      system: { id: 18, clientId: 32 },
      client: { id: 32, name: "Cliente Vetti", partnerCompanyId: 5 },
      create: async (row) => { occurrenceRows.push({ id: 101, finalizedAt: new Date("2026-08-13T18:00:00.000Z"), ...row }); },
    });

    const rows = await listOccurrencesWithDb(fakeOccurrenceDb(occurrenceRows.map((occurrence: any) => ({
      occurrence, linkedClientName: "Cliente Vetti", linkedFantasyName: null, linkedPartnerCompanyId: 5,
    }))), { partnerCompanyId: 5 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 101, account: "0336", systemId: 18, clientId: 32, clientName: "Cliente Vetti", partnerCompanyId: 5,
    });
  });
});
