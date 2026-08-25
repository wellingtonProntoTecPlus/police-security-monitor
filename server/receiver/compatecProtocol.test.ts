import { describe, expect, it } from "vitest";
import { extractCompatecFrames, parseCompatecFrame, shouldProcessCompatecEvent } from "./compatecProtocol";

describe("protocolo universal Compatec", () => {
  it("separa identificação, conta, Keep Alive e Contact ID enviados no mesmo chunk TCP", () => {
    const event = Buffer.concat([
      Buffer.from("$0334130000099A", "latin1"),
      Buffer.from([0xb6]),
    ]);
    const input = Buffer.concat([Buffer.from("*C1BDCB#0334@", "latin1"), event]);

    const parsed = extractCompatecFrames(input).frames.map(parseCompatecFrame);

    expect(parsed).toEqual([
      { kind: "identity", identifier: "C1BDCB" },
      { kind: "account", account: "0334" },
      { kind: "keep_alive" },
      {
        kind: "event",
        account: "0334",
        qualifier: "1",
        eventCode: "300",
        partition: "00",
        zoneUser: "099",
        packetCounter: "A",
        rawData: "$0334130000099A¶",
      },
    ]);
  });

  it("mantém no buffer os pacotes fracionados pelo transporte TCP", () => {
    const first = extractCompatecFrames(Buffer.from("*C1B", "latin1"));
    expect(first.frames).toHaveLength(0);
    expect(first.remainder.toString("latin1")).toBe("*C1B");

    const second = extractCompatecFrames(Buffer.concat([first.remainder, Buffer.from("DCB#0334@", "latin1")]));
    expect(second.frames.map(parseCompatecFrame)).toEqual([
      { kind: "identity", identifier: "C1BDCB" },
      { kind: "account", account: "0334" },
      { kind: "keep_alive" },
    ]);
    expect(second.remainder).toHaveLength(0);
  });

  it("evita reprocessar retransmissão do mesmo pacote com contador dentro da janela de ACK", () => {
    const recent = new Map<string, number>();
    const frame = "$0334130000099A¶";

    expect(shouldProcessCompatecEvent(recent, frame, 1_000)).toBe(true);
    expect(shouldProcessCompatecEvent(recent, frame, 1_500)).toBe(false);
    expect(shouldProcessCompatecEvent(recent, frame, 122_001)).toBe(true);
  });
});
