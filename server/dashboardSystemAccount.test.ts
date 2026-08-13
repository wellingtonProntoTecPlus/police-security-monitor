import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("indicadores operacionais e Conta do Sistema", () => {
  it("exclui a conta 0000 e eventos sem sistema vinculado dos indicadores", () => {
    const source = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

    expect(source).toContain('ne(alarmEvents.account, "0000")');
    expect(source).toContain("isNotNull(alarmEvents.alarmSystemId)");
  });
});
