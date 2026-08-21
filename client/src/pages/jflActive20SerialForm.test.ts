import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const clientDetailSource = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");
const alarmSystemsSource = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/AlarmSystems.tsx"), "utf8");

describe("campos de serial no cadastro da JFL v7 ou superior", () => {
  it("solicita dez dígitos no cadastro pelo cliente e no cadastro geral", () => {
    expect(clientDetailSource).toContain("Número de série * (JFL v7 ou superior)");
    expect(clientDetailSource).toContain("Informe os 10 dígitos do número de série da JFL versão 7 ou superior");
    expect(alarmSystemsSource).toContain("Número de Série * (JFL v7 ou superior)");
    expect(alarmSystemsSource).toContain("serialNumber: form.serialNumber || undefined");
  });
});
