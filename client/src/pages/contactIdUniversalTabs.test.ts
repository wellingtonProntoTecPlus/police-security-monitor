import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/ContactId.tsx"), "utf8");

describe("abas da tabela Contact ID", () => {
  it("mantém os universais em uma aba própria sem repeti-los nos fabricantes", () => {
    expect(source).toContain('const ABAS_CONTACT_ID = ["UNIVERSAL", ...FABRICANTES]');
    expect(source).toContain('fabricante === "UNIVERSAL" && universalCodes.length > 0');
    expect(source).toContain('fabricante !== "UNIVERSAL" && <div className="border border-border rounded-lg overflow-hidden">');
    expect(source).toContain("Código Universal (exibido apenas na aba Universal)");
  });
});
