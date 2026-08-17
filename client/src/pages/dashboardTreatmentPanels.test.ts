import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboardSource = readFileSync(resolve(process.cwd(), "client/src/pages/Dashboard.tsx"), "utf8");

describe("painéis operacionais do tratamento", () => {
  it("oferece atalhos para contatos e usuários e abre os dados em foco", () => {
    expect(dashboardSource).toContain('setTreatmentPanel("contacts")');
    expect(dashboardSource).toContain('setTreatmentPanel("users")');
    expect(dashboardSource).toContain("Contatos para atendimento");
    expect(dashboardSource).toContain("Usuários programados no painel");
    expect(dashboardSource).toContain('href={`tel:${digits}`}');
    expect(dashboardSource).toContain('href={`https://wa.me/${whatsappInternational}`}');
    expect(dashboardSource).toContain(">WhatsApp</a>");
    expect(dashboardSource).toContain('fixed inset-0 z-[95]');
  });
});
