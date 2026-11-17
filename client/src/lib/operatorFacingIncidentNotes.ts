/** Presentation only: never use this filtered text to persist incident notes. */
export function getOperatorFacingIncidentNotes(notes?: string | null) {
  if (!notes) return "";
  // Each generated block ends with this same-ID footer. Do not consume a later
  // human note, a different command's block, or an incomplete legacy block.
  const completeRemoteCommandBlock = /(?:^|\r?\n)\[COMANDO REMOTO #(\d+)(?: [^\]\r\n]+)?\]\r?\n(?:(?!\[COMANDO REMOTO #)[^\n]*\n)*?Auditoria do comando: #\1[ \t]*(?=\r?\n|$)/g;
  return notes.replace(completeRemoteCommandBlock, "").trim();
}
