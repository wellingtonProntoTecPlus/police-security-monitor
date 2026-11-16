import { describe, expect, it } from "vitest";
import { canAcquirePanelLease, isPanelLeaseActive, ownsActivePanelLease, type PanelLeaseActor, type PanelLeaseSnapshot } from "./incidentPanelLeasePolicy";

const now = new Date("2030-02-03T04:05:06.000Z");
const actor: PanelLeaseActor = { operatorId: 1, authSessionId: 101, leaseToken: "11111111-1111-4111-8111-111111111111" };
const activeLease: PanelLeaseSnapshot = {
  incidentId: 401,
  operatorId: actor.operatorId,
  authSessionId: actor.authSessionId,
  leaseToken: actor.leaseToken,
  expiresAt: new Date("2030-02-03T04:06:36.000Z"),
  sessionRevokedAt: null,
  sessionExpiresAt: new Date("2031-01-01T00:00:00.000Z"),
};

type PolicyCase = {
  label: string;
  lease: PanelLeaseSnapshot | null | undefined;
  actingAs?: PanelLeaseActor;
  active: boolean;
  owns: boolean;
  canAcquire: boolean;
};

const cases: PolicyCase[] = [
  { label: "sem lease", lease: null, active: false, owns: false, canAcquire: true },
  { label: "lease e sessão ainda válidos, mesma identidade", lease: activeLease, active: true, owns: true, canAcquire: true },
  { label: "token diferente na mesma sessão", lease: activeLease, actingAs: { ...actor, leaseToken: "44444444-4444-4444-8444-444444444444" }, active: true, owns: false, canAcquire: false },
  { label: "outra sessão do mesmo operador", lease: activeLease, actingAs: { ...actor, authSessionId: 202 }, active: true, owns: false, canAcquire: false },
  { label: "outro operador", lease: activeLease, actingAs: { ...actor, operatorId: 2 }, active: true, owns: false, canAcquire: false },
  { label: "lease expirado exatamente agora", lease: { ...activeLease, expiresAt: now }, active: false, owns: false, canAcquire: true },
  { label: "lease expirado no passado", lease: { ...activeLease, expiresAt: new Date(now.getTime() - 1) }, active: false, owns: false, canAcquire: true },
  { label: "sessão expirada exatamente agora", lease: { ...activeLease, sessionExpiresAt: now }, active: false, owns: false, canAcquire: true },
  { label: "sessão expirada no passado", lease: { ...activeLease, sessionExpiresAt: new Date(now.getTime() - 1) }, active: false, owns: false, canAcquire: true },
  { label: "sessão revogada", lease: { ...activeLease, sessionRevokedAt: new Date(now.getTime() - 1) }, active: false, owns: false, canAcquire: true },
  { label: "datas ISO válidas", lease: { ...activeLease, expiresAt: "2030-02-03T04:06:36.000Z", sessionExpiresAt: "2031-01-01T00:00:00.000Z" }, active: true, owns: true, canAcquire: true },
  { label: "data de expiração inválida", lease: { ...activeLease, expiresAt: "não-é-uma-data" }, active: false, owns: false, canAcquire: true },
  { label: "sessão sem expiração", lease: { ...activeLease, sessionExpiresAt: null }, active: false, owns: false, canAcquire: true },
];

describe("policy pura do lease de painel", () => {
  it.each(cases)("$label", ({ lease, actingAs = actor, active, owns, canAcquire }) => {
    expect(isPanelLeaseActive(lease, now)).toBe(active);
    expect(ownsActivePanelLease(lease, actingAs, now)).toBe(owns);
    expect(canAcquirePanelLease(lease, actingAs, now)).toBe(canAcquire);
  });

  it("considera ausência de snapshot inativa e livre para aquisição", () => {
    expect(isPanelLeaseActive(undefined, now)).toBe(false);
    expect(ownsActivePanelLease(undefined, actor, now)).toBe(false);
    expect(canAcquirePanelLease(undefined, actor, now)).toBe(true);
  });
});
