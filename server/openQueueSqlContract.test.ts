import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("consulta de fila e observações Radioenge", () => {
  it("correlaciona E361 com seu evento pela chave estrangeira válida", () => {
    const source = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

    expect(source).toContain("notExists(db.select({ id: alarmEvents.id }).from(alarmEvents).where(and(");
    expect(source).toContain("eq(alarmEvents.id, incidents.eventId)");
    expect(source).not.toContain("NOT (${alarmEvents.brand} = 'RADIOENGE'");
  });
});
