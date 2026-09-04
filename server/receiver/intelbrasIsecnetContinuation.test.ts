import { afterEach, describe, expect, it } from "vitest";
import { clearConfirmedIntelbrasEndpointsForTesting, getConfirmedIntelbrasEndpoint, matchesConfirmedIntelbrasEventSystem, rememberConfirmedIntelbrasEndpoint } from "./intelbrasIsecnetContinuation";

const panel0049 = { id: 49, account: "0049", brand: "INTELBRAS" };

afterEach(clearConfirmedIntelbrasEndpointsForTesting);

describe("continuidade ISECnet Intelbras entre conexões curtas", () => {
  it("recupera a central somente após o 0x94 ter sido confirmado por MAC", () => {
    expect(getConfirmedIntelbrasEndpoint("177.191.133.171", 9271, "0049", 1_000)).toBeUndefined();
    rememberConfirmedIntelbrasEndpoint("::ffff:177.191.133.171", 9271, panel0049, 1_000);
    expect(getConfirmedIntelbrasEndpoint("177.191.133.171", 9271, "0049", 1_001)).toEqual(panel0049);
  });

  it("não reaproveita a identificação depois do prazo curto de segurança", () => {
    rememberConfirmedIntelbrasEndpoint("177.191.133.171", 9271, panel0049, 1_000);
    expect(getConfirmedIntelbrasEndpoint("177.191.133.171", 9271, "0049", 301_001)).toBeUndefined();
  });

  it("bloqueia associação por IP quando duas centrais diferentes compartilham conta e endpoint", () => {
    rememberConfirmedIntelbrasEndpoint("177.191.133.171", 9271, panel0049, 1_000);
    rememberConfirmedIntelbrasEndpoint("177.191.133.171", 9271, { id: 50, account: "0049", brand: "INTELBRAS" }, 1_001);
    expect(getConfirmedIntelbrasEndpoint("177.191.133.171", 9271, "0049", 1_002)).toBeUndefined();
  });

  it("não deixa a identidade confirmada ser reutilizada para outra conta ou marca", () => {
    expect(matchesConfirmedIntelbrasEventSystem(panel0049, "0049")).toBe(true);
    expect(matchesConfirmedIntelbrasEventSystem(panel0049, "0050")).toBe(false);
    expect(matchesConfirmedIntelbrasEventSystem({ ...panel0049, brand: "JFL" }, "0049")).toBe(false);
  });
});
