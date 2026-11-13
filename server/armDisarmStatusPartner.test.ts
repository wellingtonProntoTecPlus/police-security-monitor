import { afterEach, describe, expect, it, vi } from "vitest";
import { getArmDisarmStatus, setDbForTesting } from "./db";

describe("nome da parceira nas listas Armados/Desarmados", () => {
  afterEach(() => setDbForTesting(null));

  it("retorna o nome da parceira associado diretamente ao último estado do painel", async () => {
    const receivedAt = new Date("2026-11-13T18:00:00.000Z");
    const systemRows = [{
      id: 41,
      account: "0334",
      isActive: true,
      clientId: 100,
      brand: "JFL",
      model: "Active 8W",
      clientName: "Cliente de teste",
      clientFantasyName: "Loja Teste",
      partnerName: "Parceira São José",
    }];
    const eventRows = [{
      id: 8001,
      account: "0334",
      qualifier: "R",
      eventCode: "401",
      brand: "JFL",
      receivedAt,
      alarmSystemId: 41,
      description: "Armado",
    }];

    const systemQuery: any = {
      from: vi.fn(() => systemQuery),
      innerJoin: vi.fn(() => systemQuery),
      leftJoin: vi.fn(() => systemQuery),
      where: vi.fn(async () => systemRows),
    };
    const eventQuery: any = {
      from: vi.fn(() => eventQuery),
      where: vi.fn(() => eventQuery),
      orderBy: vi.fn(async () => eventRows),
    };
    const select = vi.fn()
      .mockReturnValueOnce(systemQuery)
      .mockReturnValueOnce(eventQuery);
    setDbForTesting({ select } as any);

    const result = await getArmDisarmStatus();

    expect(systemQuery.leftJoin).toHaveBeenCalledOnce();
    expect(result.armed).toHaveLength(1);
    expect(result.armed[0]).toMatchObject({
      account: "0334",
      clientId: 100,
      clientName: "Cliente de teste",
      partnerName: "Parceira São José",
      state: "armed",
    });
    expect(result.disarmed).toEqual([]);
  });
});
