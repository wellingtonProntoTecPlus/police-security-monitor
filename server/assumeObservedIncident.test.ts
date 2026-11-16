import { afterEach, describe, expect, it } from "vitest";
import { assumeObservedIncident, setDbForTesting } from "./db";

const actor = { incidentId: 880, operatorId: 13, operatorName: "Operador Bruno" };
const leaseToken = "22222222-2222-4222-8222-222222222222";

describe("wrapper legado assumeObservedIncident", () => {
  afterEach(() => setDbForTesting(null));

  it("exige a sessão autenticada e o token do lease antes de abrir o painel", async () => {
    await expect(assumeObservedIncident({ ...actor, leaseToken }))
      .rejects.toThrow("sessão e concessão obrigatórias");
    await expect(assumeObservedIncident({ ...actor, authSessionId: 102 }))
      .rejects.toThrow("sessão e concessão obrigatórias");
    await expect(assumeObservedIncident({ ...actor, authSessionId: 102, leaseToken: "" }))
      .rejects.toThrow("sessão e concessão obrigatórias");
  });
});
