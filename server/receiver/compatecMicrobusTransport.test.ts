import { describe, expect, it } from "vitest";
import { COMPATEC_MW1_ARM_ALL, COMPATEC_MW1_DISARM_ALL, COMPATEC_MW1_SECTORS_QUERY, COMPATEC_MW1_STATUS_QUERY, COMPATEC_MW1_TOGGLE_ALL, consumeCompatecMw1StatusResponse, getCompatecMw1StatusResponseLine, getCompatecMw1StatusResponseLineForSocket, isCompatecArmDisarmConfirmation, isCompatecZoneConfigurationCommand, isCompatecZoneConfigurationConfirmation, rememberActiveCompatecSession, sendCompatecMw1BenchQuery, sendCompatecMw1StatusQuery } from "./compatecMicrobusTransport";
import { buildCompatecZoneConfigurationPayload } from "../remoteCommandContract";

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

  it("envia somente a consulta MW1 pela sessão com identidade e porta conferidas", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9334, account: "0334", receiverPort: 9271, capturedIdentifier: { identifierType: "mac_ascii", identifier: "C1BDCB" } });

    expect(sendCompatecMw1StatusQuery({ alarmSystemId: 9334, commandId: 81, expectedIdentity: { macAddress: "C1BDCB", receiverPort: 9271 } })).toEqual({
      sent: true,
      payload: COMPATEC_MW1_STATUS_QUERY,
      account: "0334",
    });
    expect(socket.writes).toEqual(["MB=AK0\r\n"]);
  });

  it("aceita o Arme oficial somente quando o transporte recebe uma sessão já autorizada", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9338, account: "0338", receiverPort: 9271, capturedIdentifier: { identifierType: "mac_ascii", identifier: "C1BDCB" } });

    expect(sendCompatecMw1BenchQuery({ alarmSystemId: 9338, commandId: 85, payload: COMPATEC_MW1_ARM_ALL, expectedIdentity: { macAddress: "C1BDCB", receiverPort: 9271 } })).toMatchObject({
      sent: true,
      payload: COMPATEC_MW1_ARM_ALL,
      account: "0338",
    });
    expect(socket.writes).toEqual(["MB=AK4[4]\r\n"]);
  });

  it("registra a resposta da central somente para a consulta pendente da mesma sessão", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9335, account: "0335", receiverPort: 9271, capturedIdentifier: { identifierType: "mac_ascii", identifier: "C1BDCB" } });
    sendCompatecMw1StatusQuery({ alarmSystemId: 9335, commandId: 82, expectedIdentity: { macAddress: "C1BDCB", receiverPort: 9271 } });

    expect(getCompatecMw1StatusResponseLine(Buffer.from("MB=KA0[03FF]\r\n"))).toBe("MB=KA0[03FF]\r\n");
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA0[03FF]\r\n")).toEqual({ commandId: 82, payload: "MB=AK0\r\n", response: "MB=KA0[03FF]\r\n" });
  });

  it("permite a consulta segura de setores e reconhece somente a resposta KA1", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9336, account: "0334", receiverPort: 9271, capturedIdentifier: { identifierType: "mac_ascii", identifier: "C1BDCB" } });
    expect(sendCompatecMw1BenchQuery({ alarmSystemId: 9336, commandId: 83, payload: COMPATEC_MW1_SECTORS_QUERY, expectedIdentity: { macAddress: "C1BDCB", receiverPort: 9271 } }).sent).toBe(true);
    expect(socket.writes).toEqual(["MB=AK1\r\n"]);
    expect(getCompatecMw1StatusResponseLine(Buffer.from("MB=KA1[0001]\r\n"))).toBe("MB=KA1[0001]\r\n");
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA1[0001]\r\n")).toEqual({ commandId: 83, payload: "MB=AK1\r\n", response: "MB=KA1[0001]\r\n" });
  });

  it("permite somente o Desarme observado na bancada e associa sua confirmação KA4", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9337, account: "0334", receiverPort: 9271, capturedIdentifier: { identifierType: "mac_ascii", identifier: "C1BDCB" } });

    expect(sendCompatecMw1BenchQuery({ alarmSystemId: 9337, commandId: 84, payload: COMPATEC_MW1_DISARM_ALL, expectedIdentity: { macAddress: "C1BDCB", receiverPort: 9271 } }).sent).toBe(true);
    expect(socket.writes).toEqual(["MB=AK4[12]\r\n"]);
    expect(getCompatecMw1StatusResponseLine(Buffer.from("MB=KA4[12]\r\n"))).toBe("MB=KA4[12]\r\n");
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA4[12]\r\n")).toEqual({ commandId: 84, payload: COMPATEC_MW1_DISARM_ALL, response: "MB=KA4[12]\r\n" });
  });

  it("confirma Arme e Desarme somente com uma resposta KA4, nunca com uma consulta", () => {
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_ARM_ALL, "MB=KA4[4]\r\n")).toBe(true);
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_ARM_ALL, "MB=KA4")).toBe(true);
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_DISARM_ALL, "MB=KA4[12]\r\n")).toBe(true);
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_DISARM_ALL, "MB=KA4\r\n")).toBe(true);
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_ARM_ALL, "MB=KA0[03FF]\r\n")).toBe(false);
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_STATUS_QUERY, "MB=KA4[4]\r\n")).toBe(false);
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_ARM_ALL, "MB=KA4[12]\r\n")).toBe(false);
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_DISARM_ALL, "MB=KA4[4]\r\n")).toBe(false);
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_ARM_ALL, "MB=KA4[]\r\n")).toBe(false);
    expect(isCompatecArmDisarmConfirmation(COMPATEC_MW1_ARM_ALL, "MB=KA4[12]\r\n")).toBe(false);
  });

  it("recusa payload físico avulso de uma zona", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9340, account: "0340", receiverPort: 9271, capturedIdentifier: { identifierType: "mac_ascii", identifier: "C1BDCB" } });
    const payload = JSON.stringify({
      protocol: "Compatec MicroBus", mode: "physical", commandType: "isolate_zone", zoneNumber: 3,
      frames: ["MB=AK2[0008]\r\n", "MB=AK1[0008]\r\n"],
    });
    const dispatched = sendCompatecMw1BenchQuery({ alarmSystemId: 9340, commandId: 89, payload, expectedIdentity: { macAddress: "C1BDCB", receiverPort: 9271 } });
    expect(dispatched.sent).toBe(false);
    expect(socket.writes).toEqual([]);
  });

  it("recompõe uma resposta KA1 fragmentada no mesmo socket, sem misturar sockets", () => {
    const firstSocket = fakeSocket();
    const otherSocket = fakeSocket();
    expect(getCompatecMw1StatusResponseLineForSocket(firstSocket, Buffer.from("bytes MB=K", "latin1"))).toBeUndefined();
    expect(getCompatecMw1StatusResponseLineForSocket(otherSocket, Buffer.from("A0[0001]\r\n", "latin1"))).toBeUndefined();
    expect(getCompatecMw1StatusResponseLineForSocket(firstSocket, Buffer.from("A1[0008]\r\n", "latin1"))).toBe("MB=KA1[0008]\r\n");
    expect(getCompatecMw1StatusResponseLineForSocket(otherSocket, Buffer.from("MB=KA0[0001]\r\n", "latin1"))).toBe("MB=KA0[0001]\r\n");
  });

  it("aguarda o fechamento dos argumentos e também aceita o ACK curto documentado", () => {
    const socket = fakeSocket();
    expect(getCompatecMw1StatusResponseLineForSocket(socket, Buffer.from("MB=KA1[", "latin1"))).toBeUndefined();
    expect(getCompatecMw1StatusResponseLineForSocket(socket, Buffer.from("0008", "latin1"))).toBeUndefined();
    expect(getCompatecMw1StatusResponseLineForSocket(socket, Buffer.from("]\r\n", "latin1"))).toBe("MB=KA1[0008]\r\n");
    expect(getCompatecMw1StatusResponseLineForSocket(socket, Buffer.from("MB=KA1", "latin1"))).toBe("MB=KA1");
  });

  it("envia vários estados setoriais em somente AK2→AK1 e KA1 encerra a ação sem AK4", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9401, account: "0401", receiverPort: 9271, capturedIdentifier: { identifierType: "mac_ascii", identifier: "C1BDCB" } });
    const payload = buildCompatecZoneConfigurationPayload({
      zoneChanges: [
        { zoneNumber: 1, armState: "armed" },
        { zoneNumber: 2, armState: "armed" },
        { zoneNumber: 3, bypassState: "annulled" },
        { zoneNumber: 4, bypassState: "annulled" },
      ],
    });
    expect(isCompatecZoneConfigurationCommand(payload)).toBe(true);
    expect(sendCompatecMw1BenchQuery({ alarmSystemId: 9401, commandId: 401, payload, expectedIdentity: { macAddress: "C1BDCB", receiverPort: 9271 } }).sent).toBe(true);
    const mask = ["0080", "0080", "0008", "0008", ...Array(19).fill("0000")].join(",");
    expect(socket.writes).toEqual([`MB=AK2[${mask}]\r\n`, `MB=AK1[${mask}]\r\n`]);
    expect(isCompatecZoneConfigurationConfirmation(payload, "MB=KA1")).toBe(true);
    expect(isCompatecZoneConfigurationConfirmation(payload, "MB=KA4[4]")).toBe(false);
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA1")).toEqual({ commandId: 401, payload, response: "MB=KA1" });
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA4[4]")).toBeUndefined();
    expect(socket.writes).toHaveLength(2);
    expect(socket.writes.join("")).not.toContain("MB=AK4");
  });

  it("rejeita payload AK2→AK1→AK4 legado sem escrever nenhum quadro", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, { id: 9402, account: "0402", receiverPort: 9271, capturedIdentifier: { identifierType: "mac_ascii", identifier: "C1BDCB" } });
    const legacy = JSON.stringify({
      protocol: "Compatec MicroBus", mode: "physical_arm_with_zones", commandType: "arm", zoneNumbers: [3],
      frames: ["MB=AK2[0008]\r\n", "MB=AK1[0008]\r\n", "MB=AK4[4]\r\n"],
    });
    expect(sendCompatecMw1BenchQuery({ alarmSystemId: 9402, commandId: 402, payload: legacy, expectedIdentity: { macAddress: "C1BDCB", receiverPort: 9271 } }).sent).toBe(false);
    expect(socket.writes).toHaveLength(0);
  });

  it("recusa escrita quando o MAC ou a porta esperados não correspondem ao socket capturado", () => {
    const socket = fakeSocket();
    rememberActiveCompatecSession(socket, {
      id: 9403,
      account: "0403",
      receiverPort: 9271,
      capturedIdentifier: { identifierType: "mac_ascii", identifier: "C1BDCB" },
    });
    const wrongMac = sendCompatecMw1BenchQuery({
      alarmSystemId: 9403,
      commandId: 403,
      payload: COMPATEC_MW1_STATUS_QUERY,
      expectedIdentity: { macAddress: "AABBCC", receiverPort: 9271 },
    });
    const wrongPort = sendCompatecMw1BenchQuery({
      alarmSystemId: 9403,
      commandId: 404,
      payload: COMPATEC_MW1_STATUS_QUERY,
      expectedIdentity: { macAddress: "C1BDCB", receiverPort: 9272 },
    });

    expect(wrongMac.sent).toBe(false);
    expect(wrongPort.sent).toBe(false);
    expect(socket.writes).toHaveLength(0);
  });

});
