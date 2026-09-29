import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const receiverSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("Heartbeat ISECnet Intelbras", () => {
  it("responde FE ao F7 e não trata o heartbeat como evento Contact ID", () => {
    expect(receiverSource).toContain("isIntelbrasIsecnetHeartbeat(data)");
    expect(receiverSource).toContain('recordKeepAlive(socket, "INTELBRAS", port, "ISECnet 0xF7")');
    expect(receiverSource).toContain("socket.write(Buffer.from([0xfe]));");
  });
});
