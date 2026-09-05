import { describe, expect, it } from "vitest";
import { resolveQueueEventClient, resolveQueueEventSystem } from "./queueEventIdentity";

const systems = [
  { id: 11, account: "0001", brand: "JFL", clientId: 101 },
  { id: 22, account: "0001", brand: "JFL", clientId: 202 },
];
const clients = [
  { id: 101, name: "Nilva Luzia dos Santos Santana" },
  { id: 202, name: "Alvorada Pneus Distribuidora Automotiva LTDA" },
];

describe("identidade da ocorrência na fila", () => {
  it("prioriza o sistema e o cliente persistidos quando duas centrais compartilham a mesma conta", () => {
    const event = { account: "0001", brand: "JFL", incidentSystemId: 2022, incidentClientId: 202, alarmSystemId: 22 };
    const system = resolveQueueEventSystem(event, systems);

    expect(system).toEqual(systems[1]);
    expect(resolveQueueEventClient(event, system, clients)).toEqual(clients[1]);
  });

  it("não escolhe arbitrariamente o primeiro sistema quando a conta é repetida e o evento não traz IDs", () => {
    const event = { account: "0001", brand: "JFL" };

    expect(resolveQueueEventSystem(event, systems)).toBeNull();
    expect(resolveQueueEventClient(event, null, clients)).toBeNull();
  });

  it("permite o fallback por conta somente quando existe um único sistema compatível", () => {
    const event = { account: "0002", brand: "JFL" };
    const singleSystem = { id: 33, account: "0002", brand: "JFL", clientId: 303 };

    expect(resolveQueueEventSystem(event, [singleSystem])).toEqual(singleSystem);
  });
});
