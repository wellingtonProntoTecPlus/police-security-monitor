/** O dashboard só pode receber uma ocorrência aberta já persistida no banco. */
export function hasPersistedOpenIncident(eventId: unknown, incidentId: unknown) {
  return Number.isInteger(eventId) && Number(eventId) > 0
    && Number.isInteger(incidentId) && Number(incidentId) > 0;
}
