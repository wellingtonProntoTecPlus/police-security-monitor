import { describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { incidents, occurrences, incidentHistory } from "../drizzle/schema";
import { bulkFinalizeOpenIncidentsWithDb, promoteExpiredRadioengeKeepAliveObservationsWithDb } from "./db";

const dialect = new MySqlDialect();
function row(id: number, status = "observing", operatorId: number | null = null, account = "0041", systemId = 41, parentIncidentId: number | null = null) {
  return {
    incident: { id, eventId: id + 100, status, operatorId, alarmSystemId: systemId, clientId: 12, parentIncidentId, version: 1, createdAt: new Date("2026-11-01T12:00:00Z"), observationUntil: null },
    event: { id: id + 100, account, brand: account === "0334" ? "COMPATEC" : "RADIOENGE", eventCode: "KOFF", qualifier: "E", partition: "00", zoneUser: "000", description: "Painel desconectado — prazo de Keep Alive excedido", priority: "high", receivedAt: new Date("2026-11-01T12:00:00Z") },
  };
}
function fakeDb(rows: ReturnType<typeof row>[], options: { failReport?: boolean; missingReportId?: boolean; shortUpdate?: boolean; expired?: boolean } = {}) {
  const reports: any[] = [], history: any[] = [], updates: any[] = [];
  let whereQuery: { sql: string; params: unknown[] } | undefined;
  let selection: any;
  const locked = vi.fn();
  const db = {
    transaction: vi.fn(async (work: (tx: any) => Promise<any>) => {
      const pendingReports: any[] = [], pendingHistory: any[] = [], pendingUpdates: any[] = [];
      const tx = {
        select: (projection: unknown) => {
          selection = projection;
          const query: any = {
            from: () => query, innerJoin: () => query, orderBy: () => query,
            where: (condition: any) => { whereQuery = dialect.sqlToQuery(condition); return query; },
            for: (value: string) => { locked(value); return query; },
            then: (resolve: any, reject: any) => {
              const selected = options.expired ? rows.filter(r => r.incident.status === "observing" && r.incident.observationUntil != null)
                : rows.filter(r => r.event.account === whereQuery!.params[0] && r.incident.alarmSystemId === whereQuery!.params[1] && r.incident.status !== "closed");
              return Promise.resolve(selected).then(resolve, reject);
            },
          };
          return query;
        },
        insert: (table: unknown) => ({ values: async (values: any[]) => {
          if (table === occurrences) {
            if (options.failReport) throw new Error("Banco recusou relatório");
            pendingReports.push(...values);
            return [{ insertId: options.missingReportId ? 0 : 1, affectedRows: values.length }];
          }
          if (table === incidentHistory) { pendingHistory.push(...values); return [{ insertId: 1 }]; }
          throw new Error("Tabela inesperada");
        } }),
        update: (table: unknown) => ({ set: (values: any) => ({ where: async (condition: any) => {
          expect(table).toBe(incidents);
          const compiled = dialect.sqlToQuery(condition);
          pendingUpdates.push({ values, condition: compiled });
          return [{ affectedRows: options.shortUpdate ? 0 : compiled.params.filter(p => typeof p === "number").length }];
        } }) }),
      };
      const result = await work(tx);
      reports.push(...pendingReports); history.push(...pendingHistory); updates.push(...pendingUpdates);
      return result;
    }),
  };
  return { db, reports, history, updates, locked, getWhere: () => whereQuery!, getSelection: () => selection };
}
const input = { account: "0041", alarmSystemId: 41, operatorId: 7, operatorName: "Operador Teste", observations: "Comunicação verificada. Encerramento solicitado." };

describe("finalização em massa persiste exatamente os registros elegíveis", () => {
  it.each(["0041", "0334"])("encerra observações KOFF sem operador da conta %s, mantendo terceiros e outros sistemas", async (account) => {
    const state = fakeDb([row(1, "observing", null, account), row(2, "attending", 7, account), row(3, "observing", 8, account), row(4, "maintenance", null, account), row(5, "waiting", null, account, 99), row(6, "waiting", null, "9999")]);
    const result = await bulkFinalizeOpenIncidentsWithDb(state.db, { ...input, account });
    expect(result).toEqual({ count: 2, closedIncidentIds: [1, 2], skippedCount: 2 });
    expect(state.locked).toHaveBeenCalledWith("update");
    expect(state.getWhere().params).toContain(41);
    expect(state.getSelection().event).not.toHaveProperty("rawData");
    expect(state.reports.map(r => r.incidentId)).toEqual([1, 2]);
    expect(state.reports.every(r => r.operatorId === 7 && !r.sendEmail && !r.sendPush)).toBe(true);
    expect(state.history.map(r => [r.incidentId, r.action, r.statusAfter])).toEqual([[1, "bulk_finalized", "closed"], [2, "bulk_finalized", "closed"]]);
    expect(state.updates[0].values).toMatchObject({ status: "closed", observationUntil: null, resolution: input.observations });
    expect(state.updates[0].condition.params).toEqual([1, 2]);
  });

  it("fecha escalada E361 sem operador, mas preserva o original em observação de outro operador", async () => {
    const escalated = row(1, "attending"); escalated.event.eventCode = "361";
    const state = fakeDb([escalated, row(2, "observing", 8), row(3, "attending", 7, "0041", 41, 2)]);
    const result = await bulkFinalizeOpenIncidentsWithDb(state.db, input);
    expect(result.closedIncidentIds).toEqual([1, 3]);
    expect(result.skippedCount).toBe(1);
    expect(state.history[1].parentIncidentId).toBe(2);
  });

  it("retorna zero e IDs vazios quando só há registros protegidos; não grava falso relatório", async () => {
    const state = fakeDb([row(1, "observing", 8), row(2, "maintenance")]);
    expect(await bulkFinalizeOpenIncidentsWithDb(state.db, input)).toEqual({ count: 0, closedIncidentIds: [], skippedCount: 2 });
    expect(state.reports).toHaveLength(0); expect(state.history).toHaveLength(0); expect(state.updates).toHaveLength(0);
  });

  it.each([{ failReport: true }, { missingReportId: true }, { shortUpdate: true }])("reverte relatório e fechamento se a transação não confirmar persistência: %j", async (options) => {
    const state = fakeDb([row(1)], options);
    await expect(bulkFinalizeOpenIncidentsWithDb(state.db, input)).rejects.toThrow();
    expect(state.reports).toHaveLength(0); expect(state.history).toHaveLength(0); expect(state.updates).toHaveLength(0);
  });

  it("não permite escopo apenas por conta, nem operador ausente ou motivo vazio", async () => {
    const state = fakeDb([]);
    await expect(bulkFinalizeOpenIncidentsWithDb(state.db, { ...input, alarmSystemId: null })).rejects.toThrow("central identificada");
    await expect(bulkFinalizeOpenIncidentsWithDb(state.db, { ...input, operatorId: null })).rejects.toThrow("Operador");
    await expect(bulkFinalizeOpenIncidentsWithDb(state.db, { ...input, observations: " " })).rejects.toThrow("descrição");
    expect(state.db.transaction).not.toHaveBeenCalled();
  });

  it("timer Radioenge bloqueia a seleção e não reabre um registro já fechado", async () => {
    const state = fakeDb([row(1, "closed")], { expired: true });
    expect(await promoteExpiredRadioengeKeepAliveObservationsWithDb(state.db)).toEqual([]);
    expect(state.locked).toHaveBeenCalledWith("update");
    expect(state.getWhere().sql).toContain("`incidents`.`status` = ?");
    expect(state.getWhere().params).toContain("observing");
    expect(state.updates).toHaveLength(0);
  });
});
