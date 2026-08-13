import { describe, expect, it } from "vitest";
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
});
