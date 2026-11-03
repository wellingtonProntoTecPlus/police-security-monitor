export type IncidentOwnershipStatus = "waiting" | "attending" | "observing" | "dispatched" | "maintenance" | "closed";
export type IncidentOwnershipAction = "claim" | "continue" | "resume" | "assume_child";

export function resolveExistingActiveChildAction(input: {
  activeChildOperatorId: number | null | undefined;
  actingOperatorId: number;
}): "reuse_existing" | "reject_other_operator" {
  return input.activeChildOperatorId === input.actingOperatorId ? "reuse_existing" : "reject_other_operator";
}

export function resolveIncidentOwnershipAction(input: {
  status: IncidentOwnershipStatus;
  assignedOperatorId: number | null | undefined;
  actingOperatorId: number;
}): IncidentOwnershipAction | null {
  if (input.status === "closed") return null;
  if (input.status === "waiting") return input.assignedOperatorId == null || input.assignedOperatorId === input.actingOperatorId ? "claim" : null;
  if (input.assignedOperatorId == null && (input.status === "observing" || input.status === "attending")) return "claim";
  if (input.assignedOperatorId === input.actingOperatorId) {
    return input.status === "observing" ? "resume" : "continue";
  }
  if (input.status === "observing") return "assume_child";
  return null;
}
