export type BulkIncidentStatus = "waiting" | "attending" | "observing" | "dispatched" | "maintenance" | "closed";

/** Observação automática sem operador não pertence a outro atendente. */
export function canBulkFinalizeIncident(input: {
  status: BulkIncidentStatus;
  operatorId?: number | null;
  parentIncidentId?: number | null;
}, actingOperatorId: number): boolean {
  if (input.status === "closed" || input.status === "maintenance") return false;
  if (input.operatorId === actingOperatorId) return true;
  // Não assumir por lote um registro independente órfão nem um despacho sem dono.
  return input.operatorId == null && input.parentIncidentId == null
    && ["waiting", "attending", "observing"].includes(input.status);
}

export function getBulkFinalizationFeedback(result: { count: number; skippedCount: number }, account: string) {
  if (result.count === 0) {
    return { type: "info" as const, message: "Nenhum evento foi finalizado. Os registros restantes pertencem a outro operador ou estão em manutenção; a fila foi atualizada." };
  }
  const message = `${result.count} atendimento(s) da conta ${account} finalizado(s) e registrado(s) no relatório.`;
  if (result.skippedCount > 0) {
    return { type: "warning" as const, message: `${message} ${result.skippedCount} registro(s) protegido(s) permanecem na fila.` };
  }
  return { type: "success" as const, message };
}
