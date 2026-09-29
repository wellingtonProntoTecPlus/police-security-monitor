import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardLayoutSource = readFileSync(
  new URL("../components/DashboardLayout.tsx", import.meta.url),
  "utf8",
);

describe("links da navegação lateral", () => {
  it("renderiza cada tela com Link real dentro do botão estilizado", () => {
    expect(dashboardLayoutSource).toContain('import { Link, useLocation } from "wouter";');
    expect(dashboardLayoutSource).toContain("<SidebarMenuButton");
    expect(dashboardLayoutSource).toContain("asChild");
    expect(dashboardLayoutSource).toContain('<Link href={item.path}>');
  });

  it("mantém o ícone Outras telas em posição global visível", () => {
    expect(dashboardLayoutSource).toContain("absolute right-4 top-16 z-40 sm:top-3");
    expect(dashboardLayoutSource).toContain('label="Outras telas"');
    expect(dashboardLayoutSource).toContain("bg-primary/10");
  });
});
