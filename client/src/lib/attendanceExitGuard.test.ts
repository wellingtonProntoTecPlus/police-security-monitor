import { describe, expect, it } from "vitest";
import { shouldConfirmAttendanceNavigation } from "./attendanceExitGuard";

describe("proteção de saída do atendimento", () => {
  const base = {
    hasActiveAttendance: true,
    currentPath: "/dashboard",
    baseHref: "https://police-central.local",
  };

  it("pede confirmação ao clicar em um link interno para outra tela", () => {
    expect(shouldConfirmAttendanceNavigation({ ...base, href: "/clients" })).toBe(true);
  });

  it("não bloqueia botão direito, Ctrl/clique ou abertura em nova janela", () => {
    expect(shouldConfirmAttendanceNavigation({ ...base, href: "/clients", button: 2 })).toBe(false);
    expect(shouldConfirmAttendanceNavigation({ ...base, href: "/clients", ctrlKey: true })).toBe(false);
    expect(shouldConfirmAttendanceNavigation({ ...base, href: "/clients", target: "_blank" })).toBe(false);
  });

  it("não pede confirmação sem atendimento ou ao permanecer na mesma tela", () => {
    expect(shouldConfirmAttendanceNavigation({ ...base, hasActiveAttendance: false, href: "/clients" })).toBe(false);
    expect(shouldConfirmAttendanceNavigation({ ...base, href: "/dashboard?tab=reports" })).toBe(false);
    expect(shouldConfirmAttendanceNavigation({ ...base, href: "https://example.com/clients" })).toBe(false);
  });
});
