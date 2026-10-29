import { describe, expect, it } from "vitest";
import { COMPATEC_MW1_ARM_ALL, COMPATEC_MW1_DISARM_ALL, COMPATEC_MW1_SECTORS_QUERY, COMPATEC_MW1_STATUS_QUERY, COMPATEC_MW1_TOGGLE_ALL, consumeCompatecMw1StatusResponse, getCompatecMw1StatusResponseLine, rememberActiveCompatecSession, sendCompatecMw1BenchQuery, sendCompatecMw1StatusQuery } from "./compatecMicrobusTransport";

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
  it("mantém os quadros oficiais fixos separados do toggle total", () => {
    expect(COMPATEC_MW1_ARM_ALL).toBe("MB=AK4[4]\r\n");
    expect(COMPATEC_MW1_DISARM_ALL).toBe("MB=AK4[12]\r\n");
    expect(COMPATEC_MW1_TOGGLE_ALL).toBe("MB=AK4[0]\r\n");
    expect(COMPATEC_MW1_ARM_ALL).not.toBe(COMPATEC_MW1_TOGGLE_ALL);
    expect(COMPATEC_MW1_DISARM_ALL).not.toBe(COMPATEC_MW1_TOGGLE_ALL);
  });

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

  it("aceita o Arme oficial somente quando o transporte recebe uma sessão já autorizada", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9338, account: "0338" });

    expect(sendCompatecMw1BenchQuery({ alarmSystemId: 9338, commandId: 85, payload: COMPATEC_MW1_ARM_ALL })).toMatchObject({
      sent: true,
      payload: COMPATEC_MW1_ARM_ALL,
      account: "0338",
    });
    expect(socket.writes).toEqual(["MB=AK4[4]\r\n"]);
  });

  it("registra a resposta da central somente para a consulta pendente da mesma sessão", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9335, account: "0335" });
    sendCompatecMw1StatusQuery({ alarmSystemId: 9335, commandId: 82 });

    expect(getCompatecMw1StatusResponseLine(Buffer.from("MB=KA0[03FF]\r\n"))).toBe("MB=KA0[03FF]\r\n");
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA0[03FF]\r\n")).toEqual({ commandId: 82, payload: "MB=AK0\r\n", response: "MB=KA0[03FF]\r\n" });
  });

  it("permite a consulta segura de setores e reconhece somente a resposta KA1", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9336, account: "0334" });
    expect(sendCompatecMw1BenchQuery({ alarmSystemId: 9336, commandId: 83, payload: COMPATEC_MW1_SECTORS_QUERY }).sent).toBe(true);
    expect(socket.writes).toEqual(["MB=AK1\r\n"]);
    expect(getCompatecMw1StatusResponseLine(Buffer.from("MB=KA1[0001]\r\n"))).toBe("MB=KA1[0001]\r\n");
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA1[0001]\r\n")).toEqual({ commandId: 83, payload: "MB=AK1\r\n", response: "MB=KA1[0001]\r\n" });
  });

  it("permite somente o Desarme observado na bancada e associa sua confirmação KA4", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9337, account: "0334" });

    expect(sendCompatecMw1BenchQuery({ alarmSystemId: 9337, commandId: 84, payload: COMPATEC_MW1_DISARM_ALL }).sent).toBe(true);
    expect(socket.writes).toEqual(["MB=AK4[12]\r\n"]);
    expect(getCompatecMw1StatusResponseLine(Buffer.from("MB=KA4[12]\r\n"))).toBe("MB=KA4[12]\r\n");
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA4[12]\r\n")).toEqual({ commandId: 84, payload: COMPATEC_MW1_DISARM_ALL, response: "MB=KA4[12]\r\n" });
  });

});
