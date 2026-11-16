import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("consulta de fila e observações Radioenge", () => {
  it("correlaciona E361 com seu evento pela chave estrangeira válida", () => {
    const source = readFileSync(resolve(process.cwd(), "server/incidentMaintenancePersistence.ts"), "utf8");

    expect(source).toContain("from(alarmEvents).where(eq(alarmEvents.id, current.eventId))");
    expect(source).toContain('event?.brand === "RADIOENGE" && event.qualifier === "E" && event.eventCode === "361"');
    expect(source).not.toContain("NOT (${alarmEvents.brand} = 'RADIOENGE'");
  });
});
