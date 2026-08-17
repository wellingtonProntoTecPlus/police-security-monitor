import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAlarmUser, listAlarmUsers, setDbForTesting, updateAlarmUser } from "./db";

const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("credenciais de usuários do painel", () => {
  let storedUser: Record<string, unknown> = {};
  const fakeDb = {
    insert: () => ({
      values: async (value: Record<string, unknown>) => {
        storedUser = { id: 71, ...value };
        return [{ insertId: 71 }];
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: async () => { storedUser = { ...storedUser, ...value }; },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [storedUser],
          orderBy: async () => [storedUser],
        }),
      }),
    }),
  };

  beforeEach(() => {
    storedUser = {};
    setDbForTesting(fakeDb as any);
  });

  it("persiste e relê as três credenciais no fluxo de criação", () => {
    expect(dbSource).toContain("db.insert(alarmUsers).values(normalizedData)");
    expect(dbSource).toContain("password: normalizedData.password");
    expect(dbSource).toContain("counterPassword: normalizedData.counterPassword");
    expect(dbSource).toContain("coercionPassword: normalizedData.coercionPassword");
    expect(dbSource).toContain("db.select().from(alarmUsers)");
  });

  it("aceita as credenciais nas rotas de criação e atualização", () => {
    expect(routerSource).toContain("password: z.string().optional()");
    expect(routerSource).toContain("counterPassword: z.string().optional()");
    expect(routerSource).toContain("coercionPassword: z.string().optional()");
    expect(dbSource).toContain("db.update(alarmUsers).set(formatRegistrationFields(data, [\"name\"]))");
  });

  it("cria, atualiza e relê as três credenciais no banco de usuários do painel", async () => {
    await createAlarmUser({ alarmSystemId: 9, userNumber: 3, name: "Maria Silva", password: "1234", counterPassword: "4321", coercionPassword: "9999" } as any);
    expect(storedUser).toMatchObject({ password: "1234", counterPassword: "4321", coercionPassword: "9999" });

    await updateAlarmUser(71, { password: "5678", counterPassword: "8765", coercionPassword: "0000" } as any);
    const [saved] = await listAlarmUsers(9);
    expect(saved).toMatchObject({ password: "5678", counterPassword: "8765", coercionPassword: "0000" });
  });
});
