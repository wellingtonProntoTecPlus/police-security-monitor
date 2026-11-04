import { afterEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { isConfirmedBulkSetEligible, summarizeBulkIncidents } from "../shared/bulkIncidentSummary";
import { previewBulkFinalizeOpenIncidents, setDbForTesting } from "./db";

describe("prévia persistida do lote", () => {
  afterEach(() => setDbForTesting(null));

  it("consulta no banco a conta e a central identificada antes de informar quantidade elegível", async () => {
    const rows = [{ id: 1, eventId: 101, status: "observing", operatorId: null }, { id: 2, eventId: 102, status: "observing", operatorId: 8 }];
    let projection: any;
    let whereQuery: any;
    const query: any = {
      from: vi.fn(() => query), innerJoin: vi.fn(() => query),
      where: vi.fn((condition) => { whereQuery = new MySqlDialect().sqlToQuery(condition); return query; }),
      orderBy: vi.fn(async () => rows),
    };
    setDbForTesting({ select: vi.fn((columns) => { projection = columns; return query; }) } as any);
    expect(await previewBulkFinalizeOpenIncidents({ account: "0041", alarmSystemId: 41, operatorId: 7 })).toMatchObject({ totalCount: 2, eligibleCount: 1, eligibleIncidentIds: [1], protectedCount: 1 });
    expect(whereQuery.params).toContain("0041");
    expect(whereQuery.params).toContain(41);
    expect(projection).not.toHaveProperty("rawData");
  });

  it("explica 24 eventos e 25 atendimentos legados, dos quais só 1 é elegível", () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      id: index + 1, eventId: index + 101, status: "observing" as const, operatorId: 8, parentIncidentId: null,
    }));
    const summary = summarizeBulkIncidents([...rows, { id: 25, eventId: 101, status: "attending", operatorId: 7, parentIncidentId: 1 }], 7);
    expect(summary).toMatchObject({ totalCount: 25, eventCount: 24, eligibleCount: 1, eligibleIncidentIds: [25], protectedCount: 24 });
    expect(summary.protectedRows).toHaveLength(24);
    expect(summary.protectedRows[0].reason).toContain("Pertence a outro operador");
  });

  it("conta cada ID uma única vez e inclui observações automáticas sem dono", () => {
    const automatic = { id: 1, eventId: 101, status: "observing" as const, operatorId: null, parentIncidentId: null };
    expect(summarizeBulkIncidents([automatic, automatic], 7)).toMatchObject({ totalCount: 1, eligibleCount: 1, eligibleIncidentIds: [1], protectedCount: 0 });
  });

  it("recusa conjunto confirmado vazio, duplicado, desaparecido ou protegido", () => {
    expect(isConfirmedBulkSetEligible([], [1, 2])).toBe(false);
    expect(isConfirmedBulkSetEligible([1, 1], [1, 2])).toBe(false);
    expect(isConfirmedBulkSetEligible([1, 2], [1])).toBe(false);
    expect(isConfirmedBulkSetEligible([1, 2], [1, 2, 3])).toBe(true);
  });
});
