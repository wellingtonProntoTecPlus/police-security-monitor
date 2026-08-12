/** A fila só pode perder a ocorrência depois que o relatório possui um ID persistido. */
export function canCloseIncidentAfterReport(reportId: unknown) {
  return Number.isInteger(reportId) && Number(reportId) > 0;
}
