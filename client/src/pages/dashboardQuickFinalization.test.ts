import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");

describe("popup de tratamento", () => {
  it("mantém o acesso aos textos prontos de finalização", () => {
    expect(dashboardSource).toContain('onClick={() => setSelectedFinalization("open")}');
    expect(dashboardSource).toContain("Finalização Rápida");
    expect(dashboardSource).toContain("Popup de Finalizações Rápidas");
    expect(dashboardSource).toContain('selectedFinalization === "open" && (\n        <div className="fixed inset-0 z-[90]');
    expect(dashboardSource).toContain('bulkFinalizeOpen && selectedEvent && (\n        <div className="fixed inset-0 z-[90]');
  });
});
