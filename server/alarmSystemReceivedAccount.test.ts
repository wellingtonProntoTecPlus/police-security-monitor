import { afterEach, describe, expect, it } from "vitest";
import { getAlarmSystemByReceivedAccount, setDbForTesting } from "./db";
import { resolveSystemAccount } from "./receiver/systemAccount";

describe("resolução do sistema pelo evento recebido", () => {
  afterEach(() => setDbForTesting(null));

  function installFakeDb(rows: any[]) {
    const fakeDb: any = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async (limit: number) => rows.slice(0, limit).map((system) => ({ system })) }),
          }),
        }),
      }),
    };
    setDbForTesting(fakeDb);
  }

  it("não associa uma JFL a uma Vetti de mesma conta em outra porta", async () => {
    installFakeDb([]);

    const system = await getAlarmSystemByReceivedAccount("0001", "JFL", 9061);

    expect(system).toBeUndefined();
    expect(resolveSystemAccount("0001", system)).toEqual({
      account: "0000",
      receivedAccount: "0001",
      isSystemAccount: true,
    });
  });

  it("não usa registro órfão/inativo nem escolhe arbitrariamente dois sistemas com a mesma conta", async () => {
    installFakeDb([
      { id: 11, account: "0021", brand: "INTELBRAS", receiverPort: 9271 },
      { id: 12, account: "0021", brand: "INTELBRAS", receiverPort: 9271 },
    ]);

    const system = await getAlarmSystemByReceivedAccount("0021", "INTELBRAS", 9271);

    expect(system).toBeUndefined();
    expect(resolveSystemAccount("0021", system)).toMatchObject({
      account: "0000",
      receivedAccount: "0021",
      isSystemAccount: true,
    });
  });

  it("retorna o único painel ativo e vinculado que bate marca, porta e conta", async () => {
    installFakeDb([{ id: 80, account: "0021", brand: "INTELBRAS", receiverPort: 9271, isActive: true, clientId: 76 }]);

    const system = await getAlarmSystemByReceivedAccount("0021", "INTELBRAS", 9271);

    expect(system).toMatchObject({ id: 80, account: "0021", brand: "INTELBRAS", clientId: 76 });
  });
});
