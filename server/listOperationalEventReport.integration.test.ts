import { describe, expect, it } from "vitest";
import { alarmEvents, contactIdCodes } from "../drizzle/schema";
import { listOperationalEventReportWithDb } from "./db";

function queryRows<T>(rows: T[], calls: { limit?: number; offsets: number[] }, predicate?: (row: T) => boolean) {
  let limit = rows.length;
  let offset = 0;
  const query: any = {
    leftJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: (value: number) => { limit = value; calls.limit = value; return query; },
    offset: (value: number) => { offset = value; calls.offsets.push(value); return query; },
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) => {
      const matching = predicate ? rows.filter(predicate) : rows;
      return Promise.resolve(matching.slice(offset, offset + limit)).then(resolve, reject);
    },
  };
  return query;
}

function makeFakeDb(rows: any[], calls: { limit?: number; offsets: number[] }, projectionKeys: string[][]) {
  const codes = [
    { code: "407", qualifier: "R", fabricante: "INTELBRAS", isUniversal: 0, category: "arm_disarm", description: "Armado por aplicativo", tipo: "arme" },
    { code: "407", qualifier: "E", fabricante: "INTELBRAS", isUniversal: 0, category: "arm_disarm", description: "Desarmado por aplicativo", tipo: "desarme" },
  ];
  return {
    select: (projection?: any) => {
      if (projection?.event) projectionKeys.push(Object.keys(projection.event));
      return {
        from: (table: unknown) => {
          if (table === contactIdCodes) return Promise.resolve(codes);
          if (table === alarmEvents) return queryRows(rows, calls, (row) => {
            if (calls.eventCodeFilter && !calls.eventCodeFilter.includes(row.event.eventCode)) return false;
            if (calls.clientId && row.clientId !== calls.clientId) return false;
            if (calls.partnerCompanyId && row.partnerCompanyId !== calls.partnerCompanyId) return false;
            return true;
          });
          throw new Error("Tabela não esperada no teste");
        },
      };
    },
  };
}

describe("listOperationalEventReport", () => {
  it("pagina no banco, não carrega rawData e mantém R407 (Arme) separado de E407 (Desarme)", async () => {
    const calls: { limit?: number; offsets: number[]; eventCodeFilter?: string[]; clientId?: number; partnerCompanyId?: number } = { offsets: [] };
    const projectionKeys: string[][] = [];
    const rows = [
      {
        event: { id: 2, alarmSystemId: 29, account: "0049", brand: "INTELBRAS", qualifier: "E", eventCode: "407", description: "Desarmado por aplicativo Usuário 198", receivedAt: new Date("2026-11-02T15:01:00Z") },
        clientId: 30, clientName: "Policesecurity", fantasyName: null, partnerCompanyId: 1,
      },
      {
        event: { id: 1, alarmSystemId: 29, account: "0049", brand: "INTELBRAS", qualifier: "R", eventCode: "407", description: "Armado por aplicativo Usuário 198", receivedAt: new Date("2026-11-02T15:00:00Z") },
        clientId: 30, clientName: "Policesecurity", fantasyName: null, partnerCompanyId: 1,
      },
    ];

    const armed = await listOperationalEventReportWithDb(makeFakeDb(rows, calls, projectionKeys), { eventGroup: "arm", limit: 1, offset: 0 });
    expect(armed).toHaveLength(1);
    expect(armed[0]).toMatchObject({ qualifier: "R", eventCode: "407", clientId: 30, partnerCompanyId: 1 });
    expect(calls.limit).toBe(500);
    expect(calls.offsets).toEqual([0]);
    expect(projectionKeys[0]).not.toContain("rawData");

    calls.offsets.length = 0;
    const disarmed = await listOperationalEventReportWithDb(makeFakeDb(rows, calls, projectionKeys), { eventGroup: "disarm", limit: 1, offset: 0 });
    expect(disarmed).toHaveLength(1);
    expect(disarmed[0]).toMatchObject({ qualifier: "E", eventCode: "407", clientId: 30, partnerCompanyId: 1 });
  });

  it("limita a quantidade retornada a mil e mantém paginação offset/limit", async () => {
    const calls: { limit?: number; offsets: number[] } = { offsets: [] };
    const projectionKeys: string[][] = [];
    await listOperationalEventReportWithDb(makeFakeDb([], calls, projectionKeys), { limit: 10000, offset: 12 });
    expect(calls.limit).toBe(1000);
    expect(calls.offsets).toEqual([12]);
  });
});
