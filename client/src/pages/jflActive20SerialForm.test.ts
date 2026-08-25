import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const clientDetailSource = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");
const alarmSystemsSource = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/AlarmSystems.tsx"), "utf8");
const profilesSource = fs.readFileSync(path.resolve(process.cwd(), "shared/alarmSystemProfiles.ts"), "utf8");

describe("campos de serial no cadastro de todas as JFL", () => {
  it("exibe serial em qualquer JFL e exige dez dígitos a partir da versão 5", () => {
    expect(clientDetailSource).toContain('systemForm.brand === "JFL"');
    expect(clientDetailSource).toContain("JFL v5 ou superior");
    expect(clientDetailSource).toContain("getAlarmSystemIdentifierValidationError");
    expect(alarmSystemsSource).toContain('form.brand === "JFL"');
    expect(alarmSystemsSource).toContain("JFL v5 ou superior");
    expect(alarmSystemsSource).toContain("serialNumber: form.serialNumber || undefined");
    expect(profilesSource).toContain("A central JFL versão 5 ou superior exige o número de série com 10 dígitos");
  });
});
