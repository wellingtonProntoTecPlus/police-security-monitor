export type IntelbrasIsecnetIdentification = {
  channel: "E" | "G" | "H";
  account: string;
  macSuffix: string;
};

function decodeContactIdNibble(nibble: number) {
  return nibble === 0x0a ? "0" : nibble.toString(16).toUpperCase();
}

export function hasValidIsecnetChecksum(frame: Buffer) {
  if (frame.length < 3) return false;
  let checksum = 0;
  for (let index = 0; index < frame.length - 1; index += 1) checksum ^= frame[index];
  return (checksum ^ 0xff) === frame[frame.length - 1];
}

/**
 * Quadro ISECnet 0x94 confirmado na AMT-8000:
 * tamanho 0x07, comando 0x94, canal, conta BCD, MAC parcial e checksum.
 * Não classifica evento nem Keep Alive: somente identifica a conexão TCP.
 */
export function parseIntelbrasIsecnetIdentification(frame: Buffer): IntelbrasIsecnetIdentification | undefined {
  if (frame.length !== 9 || frame[0] !== 0x07 || frame[1] !== 0x94 || !hasValidIsecnetChecksum(frame)) return undefined;
  const channel = String.fromCharCode(frame[2]);
  if (channel !== "E" && channel !== "G" && channel !== "H") return undefined;

  return {
    channel,
    account: `${decodeContactIdNibble(frame[3] >> 4)}${decodeContactIdNibble(frame[3] & 0x0f)}${decodeContactIdNibble(frame[4] >> 4)}${decodeContactIdNibble(frame[4] & 0x0f)}`,
    macSuffix: frame.subarray(5, 8).toString("hex").toUpperCase(),
  };
}
