import { describe, expect, it } from "vitest";
import { formatSafeCaptureLog, getSafeCaptureSummary, isSafeCaptureEnabled, recordSafeCaptureFrame } from "./safeCapture";

describe("captura segura de pacotes", () => {
  it("registra o pacote em hexadecimal com fabricante, porta e origem", () => {
    const socket = {};
    const frame = recordSafeCaptureFrame(socket, {
      brand: "VETTI",
      receiverPort: 9161,
      remoteIp: "::ffff:198.51.100.10",
      payload: Buffer.from([0x02, 0x04, 0xc0, 0x80]),
    });

    expect(frame).toMatchObject({
      brand: "VETTI",
      receiverPort: 9161,
      remoteIp: "198.51.100.10",
      totalBytes: 4,
      payloadHex: "0204C080",
      truncated: false,
    });
    expect(formatSafeCaptureLog(frame!)).toContain("[CAPTURA-IP] VETTI | porta 9161");
    expect(getSafeCaptureSummary(socket)).toContain("HEX 0204C080");
  });

  it("limita o tamanho capturado e mantém o modo ativo para as três marcas em coleta", () => {
    const socket = {};
    const frame = recordSafeCaptureFrame(socket, {
      brand: "COMPATEC",
      receiverPort: 9112,
      remoteIp: "198.51.100.11",
      payload: Buffer.alloc(140, 0xaa),
    });

    expect(frame?.truncated).toBe(true);
    expect(frame?.payloadHex).toHaveLength(256);
    expect(isSafeCaptureEnabled("COMPATEC")).toBe(true);
    expect(isSafeCaptureEnabled("VETTI")).toBe(true);
    expect(isSafeCaptureEnabled("RADIOENGE")).toBe(true);
    expect(isSafeCaptureEnabled("JFL")).toBe(false);
  });
});
