import { describe, expect, it } from "vitest";
import { findCapturedPanelCandidates, formatSafeCaptureLog, getSafeCaptureSummary, isSafeCaptureEnabled, parseJflConnectionIdentity, recordSafeCaptureFrame, resolveUniqueCapturedPanelCandidate, shouldResolveSystemByCapturedPanelIdentifier } from "./safeCapture";

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
    expect(isSafeCaptureEnabled("INTELBRAS")).toBe(true);
    expect(isSafeCaptureEnabled("VIAWEB")).toBe(true);
    expect(shouldResolveSystemByCapturedPanelIdentifier("JFL")).toBe(true);
    expect(shouldResolveSystemByCapturedPanelIdentifier("INTELBRAS")).toBe(true);
    expect(shouldResolveSystemByCapturedPanelIdentifier("VETTI")).toBe(true);
    expect(shouldResolveSystemByCapturedPanelIdentifier("COMPATEC")).toBe(true);
    expect(shouldResolveSystemByCapturedPanelIdentifier("RADIOENGE")).toBe(true);
    expect(shouldResolveSystemByCapturedPanelIdentifier("VIAWEB")).toBe(true);
    expect(shouldResolveSystemByCapturedPanelIdentifier("DESCONHECIDA")).toBe(false);
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

  it("reconhece o identificador Compatec como IMEI quando a central usa MG1/GPRS", () => {
    const candidates = findCapturedPanelCandidates("COMPATEC", [{
      brand: "COMPATEC", receiverPort: 9112, remoteIp: "198.51.100.11", capturedAt: "2026-08-23T12:00:00.000Z", totalBytes: 7, payloadHex: "2A363038343433", truncated: false,
    }], [{ id: 9, macAddress: "C1BDCB", imeiGprs: "608443" }]);

    expect(candidates).toEqual([{ systemId: 9, identifierType: "imei_ascii", identifier: "608443" }]);
    expect(resolveUniqueCapturedPanelCandidate(candidates)).toEqual({ systemId: 9, identifierType: "imei_ascii", identifier: "608443" });
  });

  it("não associa uma captura quando o mesmo MAC estiver duplicado no cadastro", () => {
    expect(resolveUniqueCapturedPanelCandidate([
      { systemId: 3, identifierType: "mac_ascii", identifier: "C1BDCB" },
      { systemId: 4, identifierType: "mac_ascii", identifier: "C1BDCB" },
    ])).toBeUndefined();
  });

  it("extrai serial e MAC do quadro de conexão JFL e encontra o painel por identificador único", () => {
    const payloadHex = "7B661D2132383031393336363231FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF343431443634334243453234A7383030020101060000015000004400000000000000000000000000000000000000000000000000000000000200000000000000000000000000000056";
    const identity = parseJflConnectionIdentity(Buffer.from(payloadHex, "hex"));
    expect(identity).toEqual({ serialNumber: "2801936621", imeiNumber: undefined, imeiSuffix: undefined, fullMac: "441D643BCE24", macSuffix: "3BCE24" });

    const candidates = findCapturedPanelCandidates("JFL", [{
      brand: "JFL", receiverPort: 9061, remoteIp: "190.111.129.105", capturedAt: "2026-08-21T00:00:00.000Z", totalBytes: 102, payloadHex, truncated: false,
    }], [{ id: 44, macAddress: "3BCE24", serialNumber: "2801936621" }]);
    expect(candidates).toEqual([
      { systemId: 44, identifierType: "serial_ascii", identifier: "2801936621" },
      { systemId: 44, identifierType: "mac_ascii", identifier: "3BCE24" },
    ]);
    expect(resolveUniqueCapturedPanelCandidate(candidates)).toEqual({ systemId: 44, identifierType: "serial_ascii", identifier: "2801936621" });
  });

  it("identifica a JFL Active 32 DUO da conta 0071 pelos campos fixos do quadro real", () => {
    const payloadHex = "7B66C72132363834363736323937333537313239303736363038343433313430383038373539354343A0373530020100021900010071000200030004000000000000000000000000000000000000000000000000000000000000003A";
    const identity = parseJflConnectionIdentity(Buffer.from(payloadHex, "hex"));
    expect(identity).toEqual({
      serialNumber: "2684676297",
      imeiNumber: "357129076608443",
      imeiSuffix: "608443",
      fullMac: "1408087595CC",
      macSuffix: "7595CC",
    });

    const candidates = findCapturedPanelCandidates("JFL", [{
      brand: "JFL", receiverPort: 9061, remoteIp: "37.25.88.1", capturedAt: "2026-08-22T19:55:00.000Z", totalBytes: 102, payloadHex, truncated: false,
    }], [
      { id: 27, macAddress: "7595CC", imeiGprs: "608443", serialNumber: "2684676297" },
      { id: 88, macAddress: "7595CC", imeiGprs: "999999", serialNumber: "1234567890" },
    ]);

    expect(candidates).toEqual([
      { systemId: 27, identifierType: "serial_ascii", identifier: "2684676297" },
      { systemId: 27, identifierType: "mac_ascii", identifier: "7595CC" },
      { systemId: 27, identifierType: "imei_ascii", identifier: "608443" },
      { systemId: 88, identifierType: "mac_ascii", identifier: "7595CC" },
    ]);
    expect(resolveUniqueCapturedPanelCandidate(candidates)).toEqual({ systemId: 27, identifierType: "serial_ascii", identifier: "2684676297" });
  });
});
