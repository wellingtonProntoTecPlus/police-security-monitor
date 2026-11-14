import { afterEach, describe, expect, it, vi } from "vitest";
import { createIncidentAuditRequestId } from "../shared/incidentAudit";

afterEach(() => vi.unstubAllGlobals());
describe("Chave idempotente de auditoria", () => {
  it("usa randomUUID nativo quando disponível", () => {
    const randomUUID = vi.fn(() => "a83170a4-9af3-4c53-bb76-5a6c1a5b031e");
    vi.stubGlobal("crypto", { randomUUID });
    expect(createIncidentAuditRequestId()).toBe("a83170a4-9af3-4c53-bb76-5a6c1a5b031e");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
  it("gera UUID v4 válido em HTTP sem randomUUID, usando somente getRandomValues", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => { for (let index = 0; index < bytes.length; index++) bytes[index] = index; return bytes; });
    vi.stubGlobal("crypto", { getRandomValues });
    expect(createIncidentAuditRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(getRandomValues.mock.calls[0][0]).toHaveLength(16);
  });
  it("não substitui fonte segura por Math.random quando crypto estiver indisponível", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => createIncidentAuditRequestId()).toThrow("Gerador seguro");
  });
});
