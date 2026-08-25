import { describe, expect, it } from "vitest";
import { COMPATEC_MW1_STATUS_QUERY, consumeCompatecMw1StatusResponse, getCompatecMw1StatusResponseLine, rememberActiveCompatecSession, sendCompatecMw1StatusQuery } from "./compatecMicrobusTransport";

function fakeSocket() {
  const writes: string[] = [];
  return {
    destroyed: false,
    writable: true,
    writes,
    once: () => undefined,
    write: (payload: string) => { writes.push(payload); return true; },
  } as any;
}

describe("transporte MicroBus Compatec de bancada", () => {
  it("envia somente a consulta MW1 pela sessão previamente autenticada", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9334, account: "0334" });

    expect(sendCompatecMw1StatusQuery({ alarmSystemId: 9334, commandId: 81 })).toEqual({
      sent: true,
      payload: COMPATEC_MW1_STATUS_QUERY,
      account: "0334",
    });
    expect(socket.writes).toEqual(["MB=AK0\r\n"]);
  });

  it("registra a resposta da central somente para a consulta pendente da mesma sessão", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9335, account: "0335" });
    sendCompatecMw1StatusQuery({ alarmSystemId: 9335, commandId: 82 });

    expect(getCompatecMw1StatusResponseLine(Buffer.from("MB=KA0[03FF]\r\n"))).toBe("MB=KA0[03FF]\r\n");
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA0[03FF]\r\n")).toEqual({ commandId: 82, payload: "MB=AK0\r\n", response: "MB=KA0[03FF]\r\n" });
  });
});
