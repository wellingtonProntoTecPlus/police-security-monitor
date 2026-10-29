import { describe, expect, it } from "vitest";
import { resolveRemoteCommandIdentity } from "./remoteCommandIdentity";

describe("identidade dos comandos remotos", () => {
  it("usa a marca Intelbras do sistema cadastrado", () => {
    expect(resolveRemoteCommandIdentity(
      { brand: "", alarmSystemId: null, incidentSystemId: 64 },
      { id: 64, brand: "Intelbras" },
    )).toEqual({ brand: "INTELBRAS", systemId: 64 });
  });

  it("normaliza a marca do evento quando o cadastro ainda não foi carregado", () => {
    expect(resolveRemoteCommandIdentity(
      { brand: " intelbras ", alarmSystemId: 49 },
      null,
    )).toEqual({ brand: "INTELBRAS", systemId: 49 });
  });

  it("prioriza o ID persistido do incidente como fallback", () => {
    expect(resolveRemoteCommandIdentity(
      { brand: "INTELBRAS", alarmSystemId: null, incidentSystemId: 98 },
      null,
    )).toEqual({ brand: "INTELBRAS", systemId: 98 });
  });
});
