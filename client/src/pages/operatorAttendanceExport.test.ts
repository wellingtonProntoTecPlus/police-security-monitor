import { describe, expect, it } from "vitest";
import { buildOperatorAttendanceCsv } from "./operatorAttendanceExport";

const row = (overrides: Partial<Parameters<typeof buildOperatorAttendanceCsv>[0][number]> = {}) => ({
  operatorName: "Amanda",
  role: "Operadora",
  loginAt: "2026-01-16T12:00:00.000Z",
  logoutAt: "2026-01-16T20:00:00.000Z",
  logoutReason: "logout",
  shiftCode: "first" as const,
  workDate: "2026-01-16",
  ...overrides,
});

describe("exportação CSV de presença dos operadores", () => {
  it("preserva login/logoff distintos por usuário e não trata session_replaced como logout normal", () => {
    const csv = buildOperatorAttendanceCsv([
      row({ operatorName: "Amanda", loginAt: "2026-01-16T12:00:00.000Z", logoutAt: "2026-01-16T20:00:00.000Z", logoutReason: "logout" }),
      row({ operatorName: "Stephane", loginAt: "2026-01-16T13:00:00.000Z", logoutAt: "2026-01-16T21:00:00.000Z", logoutReason: "session_replaced" }),
    ]);

    expect(csv).toContain('"Amanda";"Operadora";"16/01/2026, 09:00:00";"16/01/2026, 17:00:00";"Logoff normal"');
    expect(csv).toContain('"Stephane";"Operadora";"16/01/2026, 10:00:00";"16/01/2026, 18:00:00";"Sessão substituída por novo login"');
    expect(csv).not.toContain('"Stephane";"Operadora";"16/01/2026, 10:00:00";"16/01/2026, 18:00:00";"Logoff normal"');
  });

  it("inclui BOM, usa ponto e vírgula e neutraliza fórmula no início do campo", () => {
    const csv = buildOperatorAttendanceCsv([
      row({ operatorName: "=HYPERLINK(\"https://exemplo.test\")", role: "+perfil", workDate: "@2026-01-16" }),
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\n")[0]).toBe("\uFEFF\"Operador\";\"Perfil\";\"Login\";\"Logoff\";\"Situação do logoff\";\"Escala no login\";\"Motivo fora da escala\";\"Turno\";\"Dia da escala\"");
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://exemplo.test\"\")\";\"'+perfil\"");
    expect(csv).toContain("\"'+perfil\"");
    expect(csv).toContain(";\"'@2026-01-16\"");
  });

  it("escapa aspas, mantém células vazias e sinaliza ausência de encerramento", () => {
    const csv = buildOperatorAttendanceCsv([
      row({ operatorName: 'Ana "A"', logoutAt: null, logoutReason: null, shiftCode: null, workDate: null }),
    ]);

    expect(csv).toContain('"Ana ""A""";"Operadora"');
    expect(csv).toContain('"Não registrado";"Sessão não encerrada";"Sem classificação";"";"Sem turno vinculado";""');
  });
});
