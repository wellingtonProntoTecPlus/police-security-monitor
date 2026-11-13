import { describe, expect, it } from "vitest";
import { isPartnerWorkspacePath } from "./partnerAccess";
import { getWorkspaceScreensForRole } from "./workspaceScreens";

describe("telas abertas em nova aba", () => {
  it("mantém o operador limitado às telas que ele já pode acessar", () => {
    expect(getWorkspaceScreensForRole("operator").map((screen) => screen.path)).toEqual([
      "/dashboard",
      "/clients",
      "/finalizations",
    ]);
  });

  it("mantém parceiro somente na carteira Clientes até a fase de relatórios", () => {
    expect(getWorkspaceScreensForRole("partner").map((screen) => screen.path)).toEqual(["/clients"]);
    expect(isPartnerWorkspacePath("/clients")).toBe(true);
    expect(isPartnerWorkspacePath("/clients/42")).toBe(true);
    expect(isPartnerWorkspacePath("/reports")).toBe(false);
    expect(isPartnerWorkspacePath("/dashboard")).toBe(false);
    expect(isPartnerWorkspacePath("/client")).toBe(false);
  });

  it("oferece todas as telas administrativas para o administrador", () => {
    expect(getWorkspaceScreensForRole("admin").map((screen) => screen.path)).toContain("/reports");
    expect(getWorkspaceScreensForRole("admin").map((screen) => screen.path)).toContain("/settings");
    expect(getWorkspaceScreensForRole("admin").map((screen) => screen.path)).toContain("/alarm-systems");
  });
});
