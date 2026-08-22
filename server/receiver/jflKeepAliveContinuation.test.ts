import { afterEach, describe, expect, it } from "vitest";
import {
  clearConfirmedJflEndpointsForTesting,
  getConfirmedJflEndpoint,
  rememberConfirmedJflEndpoint,
  refreshConfirmedJflEndpoint,
} from "./jflKeepAliveContinuation";

describe("continuidade segura do Keep Alive JFL", () => {
  afterEach(() => clearConfirmedJflEndpointsForTesting());

  it("permite o 0x40 em outra conexão apenas após identidade JFL confirmada no mesmo IP e porta", () => {
    rememberConfirmedJflEndpoint("::ffff:37.25.88.1", 9061, { id: 27, account: "0071", brand: "JFL" }, 1_000);

    expect(getConfirmedJflEndpoint("37.25.88.1", 9061, 2_000)).toMatchObject({ id: 27, account: "0071" });
    expect(getConfirmedJflEndpoint("37.25.88.2", 9061, 2_000)).toBeUndefined();
    expect(getConfirmedJflEndpoint("37.25.88.1", 9191, 2_000)).toBeUndefined();
  });

  it("expira a continuidade e nunca escolhe uma central por IP sem confirmação recente", () => {
    rememberConfirmedJflEndpoint("37.25.88.1", 9061, { id: 27, account: "0071", brand: "JFL" }, 1_000);

    expect(getConfirmedJflEndpoint("37.25.88.1", 9061, 15 * 60 * 1000 + 1_001)).toBeUndefined();
    expect(getConfirmedJflEndpoint("37.25.88.1", 9061, 2_000)).toBeUndefined();
  });

  it("renova a memória temporária somente depois de encontrar uma identidade previamente confirmada", () => {
    rememberConfirmedJflEndpoint("37.25.88.1", 9061, { id: 27, account: "0071", brand: "JFL" }, 1_000);

    expect(refreshConfirmedJflEndpoint("37.25.88.1", 9061, 10 * 60 * 1000)).toMatchObject({ id: 27, account: "0071" });
    expect(getConfirmedJflEndpoint("37.25.88.1", 9061, 24 * 60 * 1000)).toMatchObject({ id: 27, account: "0071" });
  });
});
