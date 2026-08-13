import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { verifyPersistedAlarmUser } from "./alarmUserPersistence";

describe("persistência de usuários do painel", () => {
  const expected = { alarmSystemId: 31, userNumber: 2, name: "João Silva" };

  it("aceita somente a gravação confirmada na central solicitada", () => {
    expect(verifyPersistedAlarmUser({ id: 8, ...expected, phone: null }, expected)).toMatchObject(expected);
  });

  it("falha se a inserção não devolver um usuário persistido", () => {
    expect(() => verifyPersistedAlarmUser(undefined, expected)).toThrow("não foi gravado");
  });

  it("falha se a gravação voltar vinculada a outra central", () => {
    expect(() => verifyPersistedAlarmUser({ id: 8, ...expected, alarmSystemId: 32 }, expected)).toThrow("vínculo diferente");
  });

  it("mantém a atualização da VPS compatível com telefone e status do usuário", () => {
    const upgrade = readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
    expect(upgrade).toContain("ALTER TABLE alarm_users ADD COLUMN phone VARCHAR(20)");
    expect(upgrade).toContain("ALTER TABLE alarm_users ADD COLUMN isActive TINYINT(1)");
  });
});
