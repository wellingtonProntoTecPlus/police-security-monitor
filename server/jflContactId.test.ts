import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("tabela Contact ID JFL", () => {
  it("mantém os códigos e pares E/R extraídos do manual JFL", () => {
    const source = readFileSync(resolve(process.cwd(), "deploy/jfl_contact_id_records.mjs"), "utf8");

    expect(source).toContain('pairedAlarm("130", "Disparo da zona", "Restauração do disparo da zona")');
    expect(source).toContain('pairedFault("301", "Falta de AC", "Restauração da falta de AC")');
    expect(source).toContain('arm("401", "R", "Arme")');
    expect(source).toContain('arm("401", "E", "Desarme")');
    expect(source).toContain('test("602", "Teste periódico")');
    expect(source).toContain('analytics("738", "E", "Reconhecimento de face não cadastrada", true)');
    expect(source).toContain('analytics("742", "R", "Cruzamento de linha por veículo B-A", true)');
    expect(source).toContain('analytics("701", "E", "Login ilegal no equipamento de CFTV", false)');
    expect(source).toContain('analytics("724", "E", "Disparo da zona pelo analítico", true, { fechaComRestauracao: 1, codigoRestauracao: "724" })');
    expect(source).toContain('analytics("724", "R", "Restauração do disparo da zona pelo analítico", false)');
  });

  it("gera uma carga idempotente com dezenas de registros específicos JFL", () => {
    const source = readFileSync(resolve(process.cwd(), "deploy/seed_contact_ids.sql"), "utf8");
    const records = source.match(/SELECT '\d+', '[ER]', 'JFL'/g) ?? [];

    expect(records.length).toBeGreaterThanOrEqual(160);
    expect(source).toContain("'130', 'E', 'JFL'");
    expect(source).toContain("'130', 'R', 'JFL'");
    expect(source).toContain("'401', 'E', 'JFL'");
    expect(source).toContain("'401', 'R', 'JFL'");
    expect(source).toContain("'738', 'E', 'JFL'");
    expect(source).toContain("'742', 'R', 'JFL'");
  });

  it("prioriza o código do fabricante antes do universal no receptor", () => {
    const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    const receiverSource = readFileSync(resolve(process.cwd(), "server/receiver/index.ts"), "utf8");

    expect(dbSource).toContain("export async function getContactIdDescription(code: string, qualifier?: string, fabricante?: string)");
    expect(dbSource).toContain("eq(contactIdCodes.fabricante, fabricante)");
    expect(dbSource).toContain("eq(contactIdCodes.isUniversal, true)");
    expect(receiverSource).toContain("getContactIdDescription(evento.eventCode, evento.qualifier, evento.brand)");
  });
});
