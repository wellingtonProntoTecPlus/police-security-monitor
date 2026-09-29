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

});
