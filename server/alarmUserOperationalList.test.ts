import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("lista operacional de usuários de central", () => {
  it("retorna somente identificação necessária ao operador, sem credenciais", () => {
    const start = dbSource.indexOf("export async function listOperationalAlarmUsers()");
    const end = dbSource.indexOf("export async function createAlarmUser", start);
    const source = dbSource.slice(start, end);
    expect(source).toContain("alarmSystemId: alarmUsers.alarmSystemId");
    expect(source).toContain("userNumber: alarmUsers.userNumber");
    expect(source).toContain("name: alarmUsers.name");
    expect(source).not.toContain("password:");
    expect(source).not.toContain("counterPassword:");
    expect(source).not.toContain("coercionPassword:");
  });

  it("expõe a lista operacional somente para operadores", () => {
    expect(routerSource).toContain("operationalList: operatorProcedure.query(() => db.listOperationalAlarmUsers())");
  });
});
