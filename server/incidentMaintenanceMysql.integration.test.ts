import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { alarmSystems, authSessions, incidentHistory, incidentPanelLeases, incidents, occurrences, operatorShiftMessages } from "../drizzle/schema";
import { openIncidentPanelWithDb, pauseIncidentPanelWithDb } from "./incidentPanelLease";
import { startSystemMaintenanceWithDb, endSystemMaintenanceWithDb, reconcileOperationalIncidentWindowsWithDb } from "./incidentMaintenancePersistence";
import { createOccurrenceAndCloseIncident, listOpenQueueEvents, putIncidentInObservation, transitionIncidentForOperator, setDbForTesting } from "./db";

const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const enabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && fs.existsSync(socket));
const database = `police_incident_maintenance_${process.pid}`;
const tables = ["users", "auth_sessions", "clients", "alarm_systems", "alarm_events", "incidents", "incident_history", "incident_panel_leases", "operator_shift_messages", "occurrences"];
let pool: mysql.Pool;
let orm: ReturnType<typeof drizzle>;
const token = "00000000-0000-4000-8000-000000000001";
const actor = { operatorId: 1, operatorName: "Amanda", authSessionId: 101, leaseToken: token };
const other = { operatorId: 2, operatorName: "Yasmin", authSessionId: 102, leaseToken: "00000000-0000-4000-8000-000000000002" };
const reason = "Cliente informou falta de energia; aguardar equipe técnica.";
const reference = new Date("2030-01-01T12:00:00Z");
function ddl() {
  const snapshot = JSON.parse(fs.readFileSync(new URL("../drizzle/meta/0059_snapshot.json", import.meta.url), "utf8"));
  return tables.map((name) => {
    const table = snapshot.tables[name];
    const cols = Object.values(table.columns).map((c: any) => `\`${c.name}\` ${c.type}${c.notNull ? " NOT NULL" : " NULL"}${c.autoincrement ? " AUTO_INCREMENT" : ""}${Object.hasOwn(c, "default") ? ` DEFAULT ${typeof c.default === "boolean" ? Number(c.default) : c.default}` : ""}`);
    for (const key of Object.values(table.compositePrimaryKeys) as any[]) cols.push(`PRIMARY KEY (${key.columns.map((c: string) => `\`${c}\``).join(",")})`);
    for (const key of Object.values(table.uniqueConstraints) as any[]) cols.push(`UNIQUE KEY \`${key.name}\` (${key.columns.map((c: string) => `\`${c}\``).join(",")})`);
    for (const key of Object.values(table.indexes) as any[]) cols.push(`${key.isUnique ? "UNIQUE " : ""}KEY \`${key.name}\` (${key.columns.map((c: string) => `\`${c}\``).join(",")})`);
    return `CREATE TABLE \`${name}\` (${cols.join(",")}) ENGINE=InnoDB`;
  }).join(";\n");
}
const maintenanceInput = () => ({ systemId: 10, incidentId: 20, startAt: new Date("2030-01-01T11:00:00Z"), endAt: new Date("2030-01-01T14:00:00Z"), notes: reason });
async function open() { return openIncidentPanelWithDb(orm, { incidentId: 20 }, actor); }

describe.skipIf(!enabled)("Encaminhamento, manutenção e token · MariaDB privado", () => {
  beforeAll(async () => {
    const admin = await mysql.createConnection({ socketPath: socket, user: "root" });
    await admin.query(`CREATE DATABASE \`${database}\``); await admin.end();
    pool = mysql.createPool({ socketPath: socket, user: "root", database, timezone: "Z", connectionLimit: 4, multipleStatements: true });
    await pool.query(ddl()); orm = drizzle(pool);
  });
  beforeEach(async () => {
    setDbForTesting(orm);
    for (const table of [...tables].reverse()) await pool.query(`DELETE FROM \`${table}\``);
    await pool.query("INSERT INTO users(id,openId,name,role) VALUES(1,'maintenance-amanda','Amanda','operator'),(2,'maintenance-yasmin','Yasmin','operator'); INSERT INTO clients(id,type,propertyType,name,partnerCompanyId) VALUES(1,'pf','residence','Cliente',1); INSERT INTO alarm_systems(id,clientId,account,brand) VALUES(10,1,'0010','COMPATEC'); INSERT INTO alarm_events(id,account,brand,eventCode,qualifier,alarmSystemId) VALUES(30,'0010','COMPATEC','130','E',10); INSERT INTO incidents(id,eventId,alarmSystemId,clientId,operatorId,status,notes) VALUES(20,30,10,1,1,'attending','Registro anterior preservado');");
    await orm.insert(authSessions).values([{ id:101,userId:1,tokenHash:"a".repeat(64),expiresAt:new Date("2036-01-01Z") },{id:102,userId:2,tokenHash:"b".repeat(64),expiresAt:new Date("2036-01-01Z")}]);
  });
  afterAll(async () => { setDbForTesting(null); if (pool) { await pool.query(`DROP DATABASE \`${database}\``); await pool.end(); } });

  it("recusa motivos ausentes ou em branco em observação, tático e manutenção sem alterar estado", async () => {
    await open();
    for (const notes of [undefined, "   ", "oi"]) {
      await expect(putIncidentInObservation({incidentId:20,operatorId:1,operatorName:"Amanda",authSessionId:101,leaseToken:token,until:new Date(Date.now()+60000),notes})).rejects.toThrow("motivo operacional");
      await expect(transitionIncidentForOperator({incidentId:20,operatorId:1,operatorName:"Amanda",authSessionId:101,leaseToken:token,status:"dispatched",notes})).rejects.toThrow("motivo operacional");
      await expect(startSystemMaintenanceWithDb(orm,{...maintenanceInput(),notes:notes as any},actor,reference)).rejects.toThrow("motivo operacional");
    }
    expect((await orm.select().from(incidents))[0].status).toBe("attending");
    expect(await orm.select().from(incidentHistory)).toHaveLength(1);
    expect(await orm.select().from(incidentPanelLeases)).toHaveLength(1);
  });

  it.each(["observing", "dispatched"])("encaminha %s com motivo e libera painel sem mensagem privada", async (status) => {
    await open();
    if (status === "observing") await putIncidentInObservation({incidentId:20,operatorId:1,operatorName:"Amanda",authSessionId:101,leaseToken:token,until:new Date(Date.now()+60000),notes:reason});
    else await transitionIncidentForOperator({incidentId:20,operatorId:1,operatorName:"Amanda",authSessionId:101,leaseToken:token,status:"dispatched",notes:reason});
    const row = (await orm.select().from(incidents))[0];
    expect(row).toMatchObject({status,pauseReason:reason}); expect(row.notes).toContain("Registro anterior");
    expect(await orm.select().from(incidentPanelLeases)).toHaveLength(0);
    expect(await orm.select().from(operatorShiftMessages)).toHaveLength(0);
    expect((await orm.select().from(incidentHistory)).at(-1)?.note).toBe(reason);
    const assumed = await openIncidentPanelWithDb(orm,{incidentId:20,assume:true},other);
    expect(assumed.status).toBe(status);
  });

  it("salva manutenção, histórico e liberação na mesma transação sem Contact ID sintético", async () => {
    await open(); await startSystemMaintenanceWithDb(orm,maintenanceInput(),actor,reference);
    expect((await orm.select().from(incidents))[0]).toMatchObject({status:"maintenance",pauseReason:reason});
    expect((await orm.select().from(alarmSystems))[0].maintenanceNotes).toBe(reason);
    expect(await orm.select().from(incidentPanelLeases)).toHaveLength(0);
    expect(await orm.select().from(operatorShiftMessages)).toHaveLength(0);
    expect((await pool.query("SELECT COUNT(*) AS n FROM alarm_events"))[0]).toEqual([{n:1}]);
    expect((await orm.select().from(incidentHistory)).at(-1)?.action).toBe("maintenance");
  });

  it("não bloqueia insert de evento quando manutenção aguarda a central após ler incidentes", async () => {
    await open();
    let rowsLocked!: () => void;
    const rowsRead = new Promise<void>((resolve) => { rowsLocked = resolve; });
    const wrapSelect = (query: any): any => new Proxy(query, {
      get(target, key) {
        if (key === "then") return (resolve: any, reject: any) => target.then((rows: any) => {
          const statement = target.toSQL().sql;
          if (statement.includes('from `incidents`') && statement.includes("for update")) rowsLocked();
          return rows;
        }).then(resolve, reject);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? (...args: any[]) => wrapSelect(value.apply(target, args)) : value;
      },
    });
    const gatedDb = {
      transaction: (callback: any, config: any) => orm.transaction((tx) => callback(new Proxy(tx, {
        get(target, key) {
          if (key === "select") return (...args: any[]) => wrapSelect((target.select as any)(...args));
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      })), config),
    };
    const creator = await pool.getConnection();
    let maintenance!: Promise<any>;
    try {
      await creator.query("SET SESSION innodb_lock_wait_timeout = 2");
      await creator.beginTransaction();
      await creator.query("SELECT id FROM alarm_systems WHERE id = 10 FOR UPDATE");
      maintenance = startSystemMaintenanceWithDb(gatedDb, maintenanceInput(), actor, reference);
      const outcome = maintenance.then((value) => ({ value }), (error) => ({ error }));
      await rowsRead;
      // Manutenção bloqueou as ocorrências e agora espera a central, mantida
      // pelo receptor. READ COMMITTED não pode bloquear a inserção na faixa.
      await creator.query("INSERT INTO alarm_events(id,account,brand,eventCode,qualifier,alarmSystemId) VALUES(31,'0010','COMPATEC','130','E',10)");
      await creator.query("INSERT INTO incidents(id,eventId,alarmSystemId,clientId,status,notes) VALUES(21,31,10,1,'waiting','Novo evento concorrente preservado')");
      await creator.commit();
      const result = await outcome;
      if ("error" in result) throw result.error;
      expect(result.value).toMatchObject({ success: true });
      expect((await orm.select().from(incidents).where(eq(incidents.id, 21)))[0].notes).toBe("Novo evento concorrente preservado");
      expect((await orm.select().from(incidents).where(eq(incidents.id, 20)))[0].status).toBe("maintenance");
    } finally {
      await creator.rollback();
      creator.release();
      if (maintenance) await maintenance.catch(() => undefined);
    }
  });

  it("não altera a central nem ocorrências se outra ocorrência da mesma central possui painel ativo", async () => {
    await open();
    await pool.query("INSERT INTO incidents(id,eventId,alarmSystemId,clientId,operatorId,status) VALUES(21,30,10,1,2,'attending')");
    await openIncidentPanelWithDb(orm,{incidentId:21},other);
    await expect(startSystemMaintenanceWithDb(orm,maintenanceInput(),actor,reference)).rejects.toMatchObject({code:"CONFLICT"});
    expect((await orm.select().from(alarmSystems))[0].maintenanceEndAt).toBeNull();
    expect((await orm.select().from(incidents)).every(row => row.status === "attending")).toBe(true);
    expect(await orm.select().from(incidentPanelLeases)).toHaveLength(2);
  });

  it("assumir/finalizar ocorrência de manutenção preserva a manutenção da central e não recria a fila", async () => {
    await open(); await startSystemMaintenanceWithDb(orm,maintenanceInput(),actor,reference);
    await openIncidentPanelWithDb(orm,{incidentId:20,assume:true},other);
    await createOccurrenceAndCloseIncident(20,{account:"0010",eventCode:"130",observations:"Atendimento concluído, central permanece em manutenção."} as any,2,"Yasmin",102,other.leaseToken);
    expect((await orm.select().from(alarmSystems))[0].maintenanceEndAt).not.toBeNull();
    expect((await orm.select().from(incidents))[0].status).toBe("closed");
    expect(await listOpenQueueEvents()).toHaveLength(0);
    expect(await orm.select().from(incidents)).toHaveLength(1);
  });

  it("mantém falha em espera de restauração fora da fila e bloqueia abertura direta até o timeout ou R", async () => {
    const restorationUntil = new Date(Date.now() + 180_000);
    await orm.update(incidents).set({ status: "observing", restorationWaitPending: true, observationUntil: restorationUntil }).where(eq(incidents.id, 20));
    expect(await listOpenQueueEvents()).toHaveLength(0);
    await reconcileOperationalIncidentWindowsWithDb(orm, reference);
    await expect(openIncidentPanelWithDb(orm, { incidentId: 20 }, actor, reference)).rejects.toThrow("aguardando a restauração configurada");
    expect(await orm.select().from(incidentPanelLeases)).toHaveLength(0);
    const [pending] = await orm.select().from(incidents);
    expect(pending).toMatchObject({ status: "observing", restorationWaitPending: true });
    expect(Math.abs(pending.observationUntil!.getTime() - restorationUntil.getTime())).toBeLessThan(1000);
  });

  it("token antigo não finaliza após assunção por outro operador; novo token grava relatório", async () => {
    await open(); await pauseIncidentPanelWithDb(orm,20,reason,actor);
    await openIncidentPanelWithDb(orm,{incidentId:20,assume:true},other);
    await expect(createOccurrenceAndCloseIncident(20,{account:"0010",eventCode:"130",observations:"Resposta atrasada"} as any,1,"Amanda",101,token)).rejects.toThrow("outro operador");
    expect(await orm.select().from(occurrences)).toHaveLength(0);
    await expect(createOccurrenceAndCloseIncident(20,{account:"0010",eventCode:"130",observations:"Outro token da mesma sessão"} as any,2,"Yasmin",102,token)).rejects.toMatchObject({code:"CONFLICT"});
    await createOccurrenceAndCloseIncident(20,{account:"0010",eventCode:"130",observations:"Equipe verificou local sem anormalidade."} as any,2,"Yasmin",102,other.leaseToken);
    expect(await orm.select().from(occurrences)).toHaveLength(1);
    expect((await orm.select().from(incidents))[0].status).toBe("closed");
  });

  it("expiração não apaga manutenção prorrogada, não reabre fechamento e audita janela encerrada uma vez", async () => {
    await orm.update(alarmSystems).set({maintenanceStartAt:new Date("2030-01-01T10:00Z"),maintenanceEndAt:new Date("2030-01-01T13:00Z"),maintenanceNotes:reason}).where(eq(alarmSystems.id,10));
    await orm.update(incidents).set({status:"maintenance",pauseReason:reason}).where(eq(incidents.id,20));
    await reconcileOperationalIncidentWindowsWithDb(orm,reference);
    expect((await orm.select().from(incidents))[0].status).toBe("maintenance");
    await reconcileOperationalIncidentWindowsWithDb(orm,new Date("2030-01-01T14:00Z"));
    await reconcileOperationalIncidentWindowsWithDb(orm,new Date("2030-01-01T14:00Z"));
    expect((await orm.select().from(incidents))[0].status).toBe("attending");
    expect((await orm.select().from(incidentHistory)).filter(h=>h.action === "maintenance_expired")).toHaveLength(1);
    await orm.update(incidents).set({status:"closed"}).where(eq(incidents.id,20));
    await reconcileOperationalIncidentWindowsWithDb(orm,new Date("2030-01-01T15:00Z"));
    expect((await orm.select().from(incidents))[0].status).toBe("closed");
  });

  it("retirar manutenção respeita painel ativo de outro operador", async () => {
    await open(); await startSystemMaintenanceWithDb(orm,maintenanceInput(),actor,reference);
    await openIncidentPanelWithDb(orm,{incidentId:20,assume:true},other);
    await expect(endSystemMaintenanceWithDb(orm,{systemId:10,incidentId:20},actor)).rejects.toMatchObject({code:"CONFLICT"});
    await endSystemMaintenanceWithDb(orm,{systemId:10,incidentId:20},other);
    expect((await orm.select().from(incidents))[0].status).toBe("attending");
    expect((await orm.select().from(alarmSystems))[0].maintenanceEndAt).toBeNull();
    expect((await orm.select().from(incidentHistory)).at(-1)?.action).toBe("maintenance_released");
  });
});
