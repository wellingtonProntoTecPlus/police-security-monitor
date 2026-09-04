import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getAlarmSystemDeletionConfirmation, getDuplicateAlarmSystemIdentifierMessage } from "./db";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("proteção de exclusão de sistemas", () => {
  it("exige conta e identificador físico na confirmação", () => {
    expect(getAlarmSystemDeletionConfirmation({ account: "0029", brand: "JFL", model: "Active 8W", macAddress: "FAE1B4", serialNumber: "2835359229", isepId: null })).toBe("EXCLUIR 0029 JFL ACTIVE 8W FAE1B4");
  });

  it("valida a confirmação também na API antes de excluir", () => {
    expect(routerSource).toContain("confirmation: z.string().trim().min(1)");
    expect(routerSource).toContain("getAlarmSystemDeletionConfirmation(system)");
    expect(routerSource).toContain("Confirmação inválida. Digite exatamente:");
  });

  it("informa qual identificador técnico bloqueou um recadastro", () => {
    expect(getDuplicateAlarmSystemIdentifierMessage({ serialNumber: "2835359229", macAddress: "FAE1B4", isepId: null } as any, "Duplicate entry for key 'alarm_systems_serialNumber_unique'"))
      .toContain("Serial 2835359229");
  });
});
