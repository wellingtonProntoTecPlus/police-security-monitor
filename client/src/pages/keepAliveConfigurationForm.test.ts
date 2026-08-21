import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const clientDetailSource = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");
const alarmSystemsSource = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/AlarmSystems.tsx"), "utf8");

describe("controles de Keep Alive no cadastro de sistemas", () => {
  it("expõe frequência técnica padrão de 60 segundos e os controles de alerta nos dois cadastros", () => {
    for (const source of [clientDetailSource, alarmSystemsSource]) {
      expect(source).toContain("keepAliveExpectedIntervalSeconds: 60");
      expect(source).toContain("Frequência técnica (segundos)");
      expect(source).toContain("Gerar evento de falha de Keep Alive");
      expect(source).toContain("Gerar alerta de painel desconectado");
      expect(source).toContain("Repetir alerta de painel desconectado");
    }
  });
});
