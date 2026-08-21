import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("associação de Keep Alive JFL", () => {
  it("lembra no socket a central identificada por evento antes do próximo 0x40", () => {
    const source = readFileSync(resolve(process.cwd(), "server/receiver/index.ts"), "utf8");

    expect(source).toContain("processEvent(evento, socket.remoteAddress || '', getSafeCaptureSummary(socket), getSafeCaptureFrames(socket), socket)");
    expect(source).toContain("if (system && socket) rememberSystem(socket, system);");
    expect(source).toContain("await recordKeepAlive(socket, brand, port, \"0x40\")");
    expect(source).toContain("const captureMode = shouldResolveSystemByCapturedPanelIdentifier(evento.brand);");
    expect(source).toContain("Nenhuma central IP pode ser associada somente pela conta.");
    expect(source).toContain("MAC, IMEI ou,");
    expect(source).toContain("parseJflConnectionIdentity(data)");
    expect(source).toContain("JFL conexão identificada por");
    expect(source).not.toContain('await recordKeepAlive(socket, brand, port, "E602")');
  });
});
