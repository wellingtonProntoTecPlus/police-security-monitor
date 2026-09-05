import { afterEach, describe, expect, it } from "vitest";
import { getAlarmSystemByReceivedAccount, setDbForTesting } from "./db";
import { resolveSystemAccount } from "./receiver/systemAccount";

describe("resolução do sistema pelo evento recebido", () => {
  afterEach(() => setDbForTesting(null));

  it("envia à Conta do Sistema quando JFL e porta 9061 não correspondem ao painel Vetti de mesma conta", async () => {
    let selectCalls = 0;
    const updates: unknown[] = [];
    const fakeDb: any = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => {
        selectCalls += 1;
        return selectCalls === 1 ? [] : [{ id: 6, account: "0001", brand: "VETTI", receiverPort: 9161 }];
      } }) }) }),
      update: () => ({ set: (values: unknown) => ({ where: async () => updates.push(values) }) }),
    };
    setDbForTesting(fakeDb);

    const system = await getAlarmSystemByReceivedAccount("0001", "JFL", 9061);

    expect(system).toBeUndefined();
    expect(selectCalls).toBe(1);
    expect(updates).toHaveLength(0);
    expect(resolveSystemAccount("0001", system)).toEqual({
      account: "0000",
      receivedAccount: "0001",
      isSystemAccount: true,
    });
  });

  it("mantém o fallback legado apenas quando o receptor não informou marca nem porta", async () => {
    let selectCalls = 0;
    const fakeDb: any = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => {
        selectCalls += 1;
        return selectCalls === 1 ? [] : [{ id: 6, account: "0001", brand: "VETTI", receiverPort: 9161 }];
      } }) }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    };
    setDbForTesting(fakeDb);

    const system = await getAlarmSystemByReceivedAccount("0001");

    expect(system).toMatchObject({ id: 6, account: "0001", brand: "VETTI" });
    expect(selectCalls).toBe(2);
  });

  it("não escolhe arbitrariamente uma JFL quando a mesma conta e porta pertencem a sistemas diferentes", async () => {
    const updates: unknown[] = [];
    const fakeDb: any = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [
        { id: 11, account: "0044", brand: "JFL", receiverPort: 9061 },
        { id: 12, account: "0044", brand: "JFL", receiverPort: 9061 },
      ] }) }) }),
      update: () => ({ set: (values: unknown) => ({ where: async () => updates.push(values) }) }),
    };
    setDbForTesting(fakeDb);

    const system = await getAlarmSystemByReceivedAccount("0044", "JFL", 9061);

    expect(system).toBeUndefined();
    expect(updates).toHaveLength(0);
    expect(resolveSystemAccount("0044", system)).toMatchObject({
      account: "0000",
      receivedAccount: "0044",
      isSystemAccount: true,
    });
  });
});
