import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  emitToStaffOperations,
  getSocketRooms,
  resolveSocketAudience,
  STAFF_OPERATIONS_ROOM,
} from "./socketAudience";

const indexSource = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

describe("Socket.IO audience e rooms", () => {
  it("recusa parceiros sem vínculo e mantém parceiro vinculado fora das rooms operacionais", () => {
    expect(resolveSocketAudience("partner", null)).toBeNull();
    expect(resolveSocketAudience("partner", undefined)).toBeNull();
    expect(resolveSocketAudience("partner", 0)).toBeNull();

    const partner = resolveSocketAudience("partner", 27);
    expect(partner).toMatchObject({ role: "partner", partnerId: 27, isOperational: false });
    expect(getSocketRooms(partner!, 101, 202)).toEqual(["auth-session:101"]);
  });

  it.each(["admin", "supervisor", "operator"])("coloca %s na room staff e na room privada de operador", (role) => {
    const staff = resolveSocketAudience(role, null);
    expect(staff).toMatchObject({ role, isOperational: true });
    expect(getSocketRooms(staff!, 101, 202)).toEqual([
      "auth-session:101",
      STAFF_OPERATIONS_ROOM,
      "operator-user:202",
    ]);
  });

  it("envia eventos operacionais usando somente a room staff", () => {
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };
    emitToStaffOperations(io, "alarm:event", { kind: "alarm" });
    emitToStaffOperations(io, "incident:state", { kind: "incident" });

    expect(io.to).toHaveBeenNthCalledWith(1, STAFF_OPERATIONS_ROOM);
    expect(io.to).toHaveBeenNthCalledWith(2, STAFF_OPERATIONS_ROOM);
    expect(emit).toHaveBeenNthCalledWith(1, "alarm:event", { kind: "alarm" });
    expect(emit).toHaveBeenNthCalledWith(2, "incident:state", { kind: "incident" });
  });

  it("não contém broadcasts globais e encaminha todos os eventos de alarme/incidente à room staff", () => {
    expect(indexSource).not.toMatch(/\bio\.emit\s*\(\s*["'](?:alarm:event|incident:state)["']/);

    const operationalEventLines = indexSource
      .split("\n")
      .filter((line) => /["'](?:alarm:event|incident:state)["']/.test(line));
    expect(operationalEventLines.length).toBeGreaterThanOrEqual(4);
    expect(operationalEventLines.every((line) => line.includes("emitToStaffOperations"))).toBe(true);
  });
});
