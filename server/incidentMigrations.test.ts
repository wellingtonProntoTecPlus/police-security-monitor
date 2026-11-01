import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vpsUpgrade = readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
const initialSchema = readFileSync(new URL("../deploy/init_db.sql", import.meta.url), "utf8");
const drizzleSchema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");

describe("índices de incidentes com atendimento independente", () => {
  it("não tenta criar índice único antes de remover a restrição antiga na migração VPS", () => {
    expect(vpsUpgrade).not.toMatch(/CREATE\s+UNIQUE\s+INDEX\s+incidents_event_id_unique/i);
    expect(vpsUpgrade).toContain("ALTER TABLE `incidents` DROP INDEX `incidents_event_id_unique`");
    expect(vpsUpgrade).toContain("CREATE INDEX `incidents_event_id_idx` ON `incidents` (`eventId`)");
  });

  it("usa índice não único tanto em instalações novas quanto no schema Drizzle", () => {
    expect(initialSchema).toContain("INDEX incidents_event_id_idx (eventId)");
    expect(initialSchema).not.toMatch(/UNIQUE\s+(?:KEY|INDEX)[^\n]*incidents[^\n]*eventId/i);
    expect(drizzleSchema).toContain('index("incidents_event_id_idx").on(table.eventId)');
    expect(drizzleSchema).not.toMatch(/uniqueIndex\([^\n]*incidents_event_id/i);
  });
});
