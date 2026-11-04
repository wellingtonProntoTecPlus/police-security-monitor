import { canBulkFinalizeIncident, type BulkIncidentStatus } from "./incidentBulkFinalization";

export type BulkIncidentReference = {
  id: number;
  eventId: number;
  status: BulkIncidentStatus;
  operatorId?: number | null;
  parentIncidentId?: number | null;
};

/** A prévia conta os IDs persistidos; eventos e atendimentos legados não são a mesma unidade. */
export function summarizeBulkIncidents(rows: BulkIncidentReference[], actingOperatorId: number) {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values());
  const eligible = uniqueRows.filter((row) => canBulkFinalizeIncident(row, actingOperatorId));
  const protectedRows = uniqueRows.filter((row) => !canBulkFinalizeIncident(row, actingOperatorId));
  return {
    totalCount: uniqueRows.length,
    eventCount: new Set(uniqueRows.map((row) => row.eventId)).size,
    eligibleCount: eligible.length,
    eligibleIncidentIds: eligible.map((row) => row.id),
    protectedCount: protectedRows.length,
    protectedRows: protectedRows.map((row) => ({
      incidentId: row.id,
      operatorId: row.operatorId ?? null,
      reason: row.status === "maintenance" ? "Em manutenção" : row.operatorId != null && row.operatorId !== actingOperatorId ? "Pertence a outro operador; assuma individualmente se estiver em observação" : "Registro legado ou estado protegido",
    })),
  };
}

/** Qualquer ID que desapareça/mude de titularidade exige uma nova confirmação, sem fechar só parte. */
export function isConfirmedBulkSetEligible(confirmedIncidentIds: number[], eligibleIncidentIds: number[]) {
  const eligible = new Set(eligibleIncidentIds);
  return confirmedIncidentIds.length > 0
    && new Set(confirmedIncidentIds).size === confirmedIncidentIds.length
    && confirmedIncidentIds.every((id) => Number.isInteger(id) && id > 0 && eligible.has(id));
}
