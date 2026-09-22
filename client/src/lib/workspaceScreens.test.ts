import { describe, expect, it } from "vitest";
import { getWorkspaceScreensForRole } from "./workspaceScreens";

describe("telas abertas em nova aba", () => {
  it("mantém o operador limitado às telas que ele já pode acessar", () => {
    expect(getWorkspaceScreensForRole("operator").map((screen) => screen.path)).toEqual([
      "/dashboard",
      "/clients",
      "/finalizations",
    ]);
  });

  it("oferece todas as telas administrativas para o administrador", () => {
    expect(getWorkspaceScreensForRole("admin").map((screen) => screen.path)).toContain("/reports");
    expect(getWorkspaceScreensForRole("admin").map((screen) => screen.path)).toContain("/settings");
  });
});
