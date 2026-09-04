export type IntelbrasIsecnetIdentification = {
  channel: "E" | "G" | "H";
  account: string;
  macSuffix: string;
};

export type IntelbrasIsecnetEvent = {
  account: string;
  qualifier: "E" | "R";
  eventCode: string;
  partition: string;
  zoneUser: string;
  command: "0xB0" | "0xB4";
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

export function normalizeIntelbrasContactIdEventCode(rawCode: string) {
  const digits = rawCode.replace(/\D/g, "");
  return digits === "1130" ? "130" : digits.padStart(3, "0").slice(-3);
}

function decodeContactIdByte(byte: number) {
  return `${decodeContactIdNibble(byte >> 4)}${decodeContactIdNibble(byte & 0x0f)}`;
}

/**
 * ISECnet 0xB0 e 0xB4 encapsulam um evento Contact ID. A central envia
 * 0x0A para representar o dígito 0. Os campos de data do 0xB4 não alteram
 * a ocorrência: o servidor preserva o instante em que recebeu o quadro.
 */
export function parseIntelbrasIsecnetEvent(frame: Buffer): IntelbrasIsecnetEvent | undefined {
  const isB0 = frame.length === 19 && frame[0] === 0x11 && frame[1] === 0xb0;
  const isB4 = frame.length === 31 && frame[0] === 0x1d && frame[1] === 0xb4;
  if ((!isB0 && !isB4) || !hasValidIsecnetChecksum(frame) || frame[7] !== 0x01 || frame[8] !== 0x08) return undefined;

  const qualifier = frame[9] === 0x01 ? "E" : frame[9] === 0x03 ? "R" : undefined;
  if (!qualifier) return undefined;

  return {
    account: `${decodeContactIdNibble(frame[3])}${decodeContactIdNibble(frame[4])}${decodeContactIdNibble(frame[5])}${decodeContactIdNibble(frame[6])}`,
    qualifier,
    eventCode: normalizeIntelbrasContactIdEventCode(`${decodeContactIdNibble(frame[10])}${decodeContactIdNibble(frame[11])}${decodeContactIdNibble(frame[12])}`),
    partition: decodeContactIdByte(frame[13]),
    // ZZZ ocupa três bytes independentes no ISECnet. Não compactar os dois
    // primeiros bytes, pois isso perderia o dígito central (ex.: usuário 198).
    zoneUser: `${decodeContactIdNibble(frame[15])}${decodeContactIdNibble(frame[16])}${decodeContactIdNibble(frame[17])}`,
    command: isB0 ? "0xB0" : "0xB4",
  };
}

export function extractIntelbrasIsecnetFrames(payload: Buffer) {
  const frames: Buffer[] = [];
  let offset = 0;
  while (offset < payload.length) {
    const contentLength = payload[offset];
    const frameLength = contentLength + 2;
    if (contentLength === 0 || frameLength > 512) {
      offset += 1;
      continue;
    }
    if (offset + frameLength > payload.length) break;
    frames.push(payload.subarray(offset, offset + frameLength));
    offset += frameLength;
  }
  return { frames, remainder: payload.subarray(offset) };
}
