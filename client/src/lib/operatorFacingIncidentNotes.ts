import { compactRemoteCommandAuditNotes } from "@shared/remoteCommandAuditSummary";

/** Presentation only: never use this filtered text to persist incident notes. */
export function getOperatorFacingIncidentNotes(notes?: string | null) {
  return compactRemoteCommandAuditNotes(notes);
}
