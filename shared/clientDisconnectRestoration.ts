export type ClientDisconnectEventLike = {
  qualifier: string;
  eventCode: string;
  description?: string | null;
};

/** Não confunde outros usos do Contact ID 365 (por exemplo, falha do módulo Ethernet). */
export function isClientDisconnectedE365(event: ClientDisconnectEventLike) {
  if (event.qualifier.trim().toUpperCase() !== "E" || event.eventCode.trim() !== "365") return false;
  const normalizedDescription = (event.description || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return /\bcliente desconectad[oa]\b/.test(normalizedDescription);
}
