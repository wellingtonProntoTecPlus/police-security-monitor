export type OpenOperatorIncident = { incidentId: number; status: string; account?: string | null };
export type OperatorHandoffInput = { incidentId: number; toUserId: number; message: string };

export function validateOperatorHandoffPlan(input: {
  openIncidents: OpenOperatorIncident[];
  handoffs: OperatorHandoffInput[];
  allowedRecipientIds: ReadonlySet<number>;
}) {
  const byIncident = new Map(input.handoffs.map((handoff) => [handoff.incidentId, handoff]));
  if (byIncident.size !== input.handoffs.length) throw new Error("Há itens duplicados na passagem de turno. Atualize a lista e tente novamente.");
  const maintenance = input.openIncidents.find((incident) => incident.status === "maintenance");
  if (maintenance) throw new Error(`O atendimento #${maintenance.incidentId} está em manutenção. Peça ao supervisor para encerrá-lo ou reclassificá-lo antes do logoff.`);
  if (input.openIncidents.length !== input.handoffs.length || input.openIncidents.some((incident) => !byIncident.has(incident.incidentId))) {
    throw new Error("A lista de ocorrências mudou. Nenhuma passagem ou logoff foi gravado; atualize a lista e confira novamente.");
  }
  for (const incident of input.openIncidents) {
    const handoff = byIncident.get(incident.incidentId)!;
    if (handoff.message.trim().length < 10) throw new Error(`Escreva uma anotação de pelo menos 10 caracteres para a ocorrência #${incident.incidentId}.`);
    if (!input.allowedRecipientIds.has(handoff.toUserId)) throw new Error(`O destinatário da ocorrência #${incident.incidentId} não está na escala do próximo turno. Atualize a lista.`);
  }
  return input.openIncidents.map((incident) => ({ incident, handoff: byIncident.get(incident.incidentId)! }));
}
