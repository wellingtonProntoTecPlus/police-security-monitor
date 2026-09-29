import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");

describe("proteção do atendimento em andamento", () => {
  it("protege fechar, recarregar, links internos e botão Voltar", () => {
    expect(dashboardSource).toContain("requestCloseAttendance");
    expect(dashboardSource).toContain('"beforeunload"');
    expect(dashboardSource).toContain('"popstate"');
    expect(dashboardSource).toContain("shouldConfirmAttendanceNavigation");
    expect(dashboardSource).toContain("Deseja sair sem finalizar esta ocorrência?");
  });

  it("mantém Outras telas visível ao lado de Ocorrência Manual", () => {
    expect(dashboardSource).toContain('<Plus className="h-3.5 w-3.5 mr-1.5" /> Ocorrência Manual');
    expect(dashboardSource).toContain('label="Outras telas"');
    expect(dashboardSource).toContain("border-primary/60 bg-primary/10 font-semibold text-primary");
  });
});
