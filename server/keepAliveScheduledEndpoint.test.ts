import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("endpoint local do verificador de Keep Alive", () => {
  it("aceita apenas a chamada local da VPS e emite eventos recém-abertos", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(source).toContain('app.post("/api/internal/keep-alive-disconnect-sweep"');
    expect(source).toContain('return res.status(403).json({ error: "loopback-only" })');
    expect(source).toContain('io.emit("alarm:event"');
  });
});
