import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sincronização Contact ID JFL e VIAWEB", () => {
  it("corrige somente registros específicos dos fabricantes e preserva a tabela Universal", () => {
    const source = readFileSync(resolve(process.cwd(), "deploy/sync_contact_id_jfl_viaweb.sql"), "utf8");

    expect(source).toContain("A tabela UNIVERSAL não é alterada por este arquivo");
    expect(source).toContain("code = '366'");
    expect(source).toContain("SELECT '365', 'E', 'JFL'");
    expect(source).toContain("SELECT '365', 'R', 'JFL'");
    expect(source).toContain("SELECT '430', 'R', 'JFL'");
    expect(source).toContain("SELECT '628', 'R', 'JFL'");
  });

  it("mantém os significados operacionais de aplicativo, Keep Alive e PGM da JFL", () => {
    const source = readFileSync(resolve(process.cwd(), "deploy/sync_contact_id_jfl_viaweb.sql"), "utf8");

    expect(source).toContain("Falha de Keep Alive IP");
    expect(source).toContain("Keep Alive restaurado IP");
    expect(source).toContain("Armado por aplicativo");
    expect(source).toContain("Desarmado por aplicativo");
    expect(source).toContain("Autoarme por horário programado");
    expect(source).toContain("Autodesarme por horário programado");
    expect(source).toContain("Detecção de pessoa");
    expect(source).toContain("SELECT '708', 'E', 'JFL'");
    expect(source).toContain("SELECT '708', 'R', 'JFL'");
  });

  it("mantém o E603 VIAWEB fora desta alteração e atualiza apenas o teste periódico E602", () => {
    const source = readFileSync(resolve(process.cwd(), "deploy/sync_contact_id_jfl_viaweb.sql"), "utf8");

    expect(source).toContain("fabricante = 'VIAWEB' AND code = '602' AND qualifier = 'E'");
    expect(source).not.toContain("code = '603'");
  });

  it("alinha os qualificadores de autoarme e mantém a detecção de pessoa como disparo", () => {
    const records = readFileSync(resolve(process.cwd(), "deploy/jfl_contact_id_records.mjs"), "utf8");
    const seed = readFileSync(resolve(process.cwd(), "deploy/seed_contact_ids.sql"), "utf8");

    expect(records).toContain('arm("403", "E", "Autoarme por horário programado")');
    expect(records).toContain('arm("403", "R", "Autodesarme por horário programado")');
    expect(records).toContain('analytics("730", "E", "Detecção de pessoa", true)');
    expect(seed).toContain("SELECT '101', 'E', 'JFL'");
    expect(seed).toContain("SELECT '403', 'E', 'JFL', 0, 'Autoarme por horário programado'");
    expect(seed).toContain("SELECT '730', 'E', 'JFL', 0, 'Detecção de pessoa', 'analitico', '#EF4444', 1, 0");
  });

  it("fornece uma conferência somente leitura integral após a sincronização", () => {
    const verify = readFileSync(resolve(process.cwd(), "deploy/verify_contact_id_jfl_viaweb.sql"), "utf8");

    expect(verify).toContain("UNIVERSAL_PRESERVADA");
    expect(verify).toContain("WHERE isUniversal = 1");
    expect(verify).toContain("fabricante IN ('JFL', 'VIAWEB')");
    expect(verify).toContain("PONTOS_CRITICOS");
  });
});
