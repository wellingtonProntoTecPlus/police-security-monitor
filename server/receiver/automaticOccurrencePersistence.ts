import { getAutomaticOccurrenceAssociation, type OccurrenceClientReference, type OccurrenceSystemReference } from "./automaticOccurrenceAssociation";

export type AutomaticOccurrencePayload = {
  account: string;
  eventCode: string;
  qualifier?: string | null;
  partition?: string | null;
  zoneUser?: string | null;
  description?: string | null;
  priority?: string | null;
  brand?: string | null;
  operatorName: string;
  observations: string;
  logs: string;
  attendingTimeMs: number;
  eventReceivedAt: Date;
};

export async function persistAutomaticOccurrence(
  input: {
    occurrence: AutomaticOccurrencePayload;
    system?: OccurrenceSystemReference | null;
    client?: OccurrenceClientReference | null;
    create: (data: AutomaticOccurrencePayload & ReturnType<typeof getAutomaticOccurrenceAssociation>) => Promise<unknown>;
  },
) {
  const association = getAutomaticOccurrenceAssociation(input.system, input.client);
  const persisted = { ...input.occurrence, ...association };
  await input.create(persisted);
  return persisted;
}
