import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const upgrade = fs.readFileSync(path.join(root, "deploy/upgrade_vps.sql"), "utf8");
const initialSchema = fs.readFileSync(path.join(root, "deploy/init_db.sql"), "utf8");
const schema = fs.readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");
const dbSource = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
const migration0040 = fs.readFileSync(path.join(root, "drizzle/0040_short_mongoose.sql"), "utf8");
const migration0041 = fs.readFileSync(path.join(root, "drizzle/0041_shocking_starhawk.sql"), "utf8");

const performanceIndexes = [
  "alarm_events_received_idx",
  "alarm_events_system_code_received_idx",
  "alarm_events_code_system_received_idx",
  "alarm_events_auto_event_received_idx",
  "alarm_events_account_received_idx",
  "occurrences_finalized_idx",
  "occurrences_account_finalized_idx",
  "occurrences_client_finalized_idx",
  "occurrences_partner_finalized_idx",
];

describe("índices de desempenho do banco", () => {
  it("declara os mesmos índices no schema, instalação nova, migração VPS e migrações Drizzle", () => {
    for (const name of performanceIndexes) {
      expect(schema).toContain(`index("${name}")`);
      expect(initialSchema).toContain(`INDEX ${name}`);
      expect(upgrade).toContain(`INDEX_NAME='${name}'`);
      expect(migration0040 + migration0041).toContain(`CREATE INDEX \`${name}\``);
    }
  });

  it("não recria o índice Keep Alive que já existe na VPS e na instalação inicial", () => {
    const keepAliveIndex = "system_keep_alive_samples_system_received";
    expect(initialSchema).toContain(`INDEX ${keepAliveIndex}`);
    expect(schema).toContain(`index("${keepAliveIndex}")`);
    expect(upgrade).not.toContain(`CREATE INDEX \`${keepAliveIndex}\``);
    expect(migration0040 + migration0041).not.toContain(`CREATE INDEX \`${keepAliveIndex}\``);
  });

  it("consulta somente até 30 amostras por painel e limita concorrência em lotes de 10", () => {
    expect(dbSource).toContain(".limit(30)");
    expect(dbSource).toContain("start += 10");
    expect(dbSource).toContain(".where(eq(systemKeepAliveSamples.alarmSystemId, system.id))");
    expect(dbSource).not.toContain(".where(inArray(systemKeepAliveSamples.alarmSystemId");
  });
});
