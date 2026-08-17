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

  it("mantém providências completas e credenciais de segurança acessíveis ao operador", () => {
    expect(dashboardSource).toContain("Ver tudo");
    expect(dashboardSource).toContain("Providências e histórico do atendimento");
    expect(dashboardSource).toContain("Credenciais de segurança");
    expect(dashboardSource).toContain("Credenciais do usuário");
    expect(dashboardSource).toContain("counterPassword");
    expect(dashboardSource).toContain("coercionPassword");
  });

  it("mantém providências legíveis de imediato e posiciona zonas na coluna esquerda", () => {
    expect(dashboardSource).toContain("trpc.clientProcedure.list.useQuery");
    expect(dashboardSource).toContain("Providências operacionais");
    expect(dashboardSource).toContain("Orientações cadastradas para este cliente");
    expect(dashboardSource).toContain('lg:grid-cols-[0.82fr_1.18fr]');
    expect(dashboardSource).toContain("Zonas e setores");
  });
});
