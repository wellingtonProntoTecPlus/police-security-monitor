import { describe, expect, it } from "vitest";
import { findCapturedPanelCandidates, formatSafeCaptureLog, getSafeCaptureSummary, isSafeCaptureEnabled, recordSafeCaptureFrame, resolveUniqueCapturedPanelCandidate } from "./safeCapture";

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

  it("limita o tamanho capturado e mantém o modo ativo para as marcas em coleta", () => {
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
    expect(isSafeCaptureEnabled("JFL")).toBe(true);
  });

  it("reconhece os seis caracteres MAC confirmados para Vetti, Radioenge e Compatec", () => {
    const systems = [
      { id: 1, macAddress: "2DE4A8" },
      { id: 2, macAddress: "600C81" },
    ];

    expect(findCapturedPanelCandidates("VETTI", [{
      brand: "VETTI", receiverPort: 9161, remoteIp: "198.51.100.10", capturedAt: "2026-08-13T12:00:00.000Z", totalBytes: 10, payloadHex: "0209C0420002DE4A8D80", truncated: false,
    }], systems)).toEqual([{ systemId: 1, identifierType: "mac_hex", identifier: "2DE4A8" }]);

    expect(findCapturedPanelCandidates("RADIOENGE", [{
      brand: "RADIOENGE", receiverPort: 9035, remoteIp: "198.51.100.10", capturedAt: "2026-08-13T12:00:00.000Z", totalBytes: 14, payloadHex: "7B66002139393036323934363537", truncated: false,
    }], systems)).toEqual([{ systemId: 2, identifierType: "mac_decimal", identifier: "6294657" }]);

    const compatecCandidates = findCapturedPanelCandidates("COMPATEC", [{
      brand: "COMPATEC", receiverPort: 9112, remoteIp: "198.51.100.10", capturedAt: "2026-08-13T12:00:00.000Z", totalBytes: 7, payloadHex: "2A433142444342", truncated: false,
    }], [{ id: 3, macAddress: "C1BDCB" }]);
    expect(compatecCandidates).toEqual([{ systemId: 3, identifierType: "mac_ascii", identifier: "C1BDCB" }]);
    expect(resolveUniqueCapturedPanelCandidate(compatecCandidates)).toEqual({ systemId: 3, identifierType: "mac_ascii", identifier: "C1BDCB" });
  });

  it("não associa uma captura quando o mesmo MAC estiver duplicado no cadastro", () => {
    expect(resolveUniqueCapturedPanelCandidate([
      { systemId: 3, identifierType: "mac_ascii", identifier: "C1BDCB" },
      { systemId: 4, identifierType: "mac_ascii", identifier: "C1BDCB" },
    ])).toBeUndefined();
  });
});
