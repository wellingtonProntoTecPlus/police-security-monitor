import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("prévia Vite sem HMR", () => {
  it("desativa HMR e remove o cliente Vite que tenta abrir WebSocket", () => {
    const source = readFileSync(resolve(process.cwd(), "server/_core/vite.ts"), "utf8");

    expect(source).toContain("hmr: false");
    expect(source).toContain("transformIndexHtml");
    expect(source).toContain("/@vite/client");
    expect(source).toContain("transformedPage.replace");
    expect(source).toContain('"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"');
    expect(source).toContain('app.get("/@vite/client"');
    expect(source).toContain("export function createHotContext()");
    expect(source).toContain("export function updateStyle");
    expect(source).toContain("export function removeStyle");
  });
});
