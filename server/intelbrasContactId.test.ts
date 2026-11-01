import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const records = readFileSync(new URL("../deploy/intelbras_contact_id_records.mjs", import.meta.url), "utf8");
const seed = readFileSync(new URL("../deploy/seed_contact_ids.sql", import.meta.url), "utf8");
const generator = readFileSync(new URL("../deploy/generate_contact_id_seed.mjs", import.meta.url), "utf8");
const upgrade = readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");

describe("códigos Contact ID Intelbras", () => {
  it("define E403 como auto-desativação e R403 como auto-ativação, separados por qualificador", () => {
    expect(records).toContain('code: "403",\n    qualifier: "E",\n    description: "Auto-desativação (Desarme automático)",\n    tipo: "desarme"');
    expect(records).toContain('code: "403",\n    qualifier: "R",\n    description: "Auto-ativação (Arme automático)",\n    tipo: "arme"');
    expect(records).toContain('fabricante: "INTELBRAS"');
    expect(records).toContain("isUniversal: false");
  });

  it("define R407/E407 como arme/desarme pelo aplicativo, em registros Intelbras separados", () => {
    expect(records).toContain('code: "407",\n    qualifier: "R",\n    description: "Armado por aplicativo",\n    tipo: "arme"');
    expect(records).toContain('code: "407",\n    qualifier: "E",\n    description: "Desarmado por aplicativo",\n    tipo: "desarme"');
    expect(records).toContain("fabricante: \"INTELBRAS\"");
  });

  it("inclui as entradas Intelbras no gerador e no seed idempotente usado pela atualização", () => {
    expect(generator).toContain("import { intelbrasContactIdRecords }");
    expect(generator).toContain("...intelbrasContactIdRecords");
    expect(seed).toContain("'407', 'R', 'INTELBRAS', 0, 'Armado por aplicativo'");
    expect(seed).toContain("'407', 'E', 'INTELBRAS', 0, 'Desarmado por aplicativo'");
    expect(seed).toContain("WHERE fabricante = 'INTELBRAS' AND code = '407' AND qualifier = 'R'");
    expect(seed).toContain("WHERE fabricante = 'INTELBRAS' AND code = '407' AND qualifier = 'E'");
    expect(seed).toContain("'403', 'E', 'INTELBRAS', 0, 'Auto-desativação (Desarme automático)'");
    expect(seed).toContain("'403', 'R', 'INTELBRAS', 0, 'Auto-ativação (Arme automático)'");
    expect(seed).toContain("WHERE code = '403' AND qualifier = 'E' AND fabricante = 'INTELBRAS'");
    expect(seed).toContain("WHERE code = '403' AND qualifier = 'R' AND fabricante = 'INTELBRAS'");
  });

  it("corrige descrições históricas apenas para E/R 403 Intelbras ainda não catalogados, sem tocar na captura bruta", () => {
    expect(upgrade).toContain("WHEN qualifier = 'E' THEN 'Auto-desativação (Desarme automático)'");
    expect(upgrade).toContain("WHEN qualifier = 'R' THEN 'Auto-ativação (Arme automático)'");
    expect(upgrade).toMatch(/WHERE UPPER\(TRIM\(COALESCE\(brand, ''\)\)\) = 'INTELBRAS'/);
    expect(upgrade).toMatch(/AND description LIKE 'EVENTO NÃO CADASTRADO%'/);
    expect(upgrade).not.toMatch(/UPDATE\s+alarm_events[\s\S]*?SET[\s\S]*?rawData\s*=/i);
  });
});
