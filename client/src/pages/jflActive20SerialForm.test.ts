import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const clientDetailSource = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");
const alarmSystemsSource = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/AlarmSystems.tsx"), "utf8");
const profilesSource = fs.readFileSync(path.resolve(process.cwd(), "shared/alarmSystemProfiles.ts"), "utf8");

describe("campos de serial no cadastro da JFL v7 ou superior", () => {
  it("solicita dez dígitos no cadastro pelo cliente e no cadastro geral", () => {
    expect(clientDetailSource).toContain("Número de série * (JFL v7 ou superior)");
    expect(clientDetailSource).toContain("getAlarmSystemIdentifierValidationError");
    expect(alarmSystemsSource).toContain("Número de Série * (JFL v7 ou superior)");
    expect(alarmSystemsSource).toContain("serialNumber: form.serialNumber || undefined");
    expect(profilesSource).toContain("A central JFL versão 7 ou superior exige o número de série com 10 dígitos");
  });
});
