import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyPersistedAlarmUser } from "./alarmUserPersistence";

describe("usuário mestre do painel", () => {
  const masterUser = {
    id: 1,
    alarmSystemId: 31,
    userNumber: 0,
    name: "Usuário Mestre",
    phone: null,
    password: "1234",
    counterPassword: "4321",
    coercionPassword: "9999",
  };

  it("aceita e confirma a persistência do código 0", () => {
    expect(verifyPersistedAlarmUser(masterUser, masterUser)).toMatchObject({
      alarmSystemId: 31,
      userNumber: 0,
      name: "Usuário Mestre",
    });
  });

  it("libera o código 0 nas validações da API", () => {
    const routersSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routersSource).toContain("userNumber: z.number().int().min(0)");
    expect(routersSource).toContain("userNumber: z.number().int().min(0).optional()");
  });

  it("exibe no cadastro e na edição que 0 é o usuário mestre", () => {
    const pageSource = readFileSync(new URL("../client/src/pages/ClientDetail.tsx", import.meta.url), "utf8");
    expect(pageSource).toContain("Nº do usuário * (0 = mestre)");
    expect(pageSource).toContain('min={0}');
    expect(pageSource).toContain("editingAlarmUser.userNumber ?? 0");
    expect(pageSource).toContain('alarmUser.userNumber === 0 ? "0"');
  });
});
