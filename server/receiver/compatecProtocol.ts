export type CompatecProtocolFrame =
  | { kind: "identity"; identifier: string }
  | { kind: "account"; account: string }
  | { kind: "keep_alive" }
  | {
    kind: "event";
    account: string;
    qualifier: string;
    eventCode: string;
    partition: string;
    zoneUser: string;
    packetCounter: string;
    rawData: string;
  };

/**
 * O protocolo universal Compatec não possui um delimitador entre *ID, #CONTA
 * e @. Esses pacotes têm tamanho fixo. O evento Contact ID termina em 0xB6.
 * Esta função permite que o receptor lide corretamente com pacotes TCP juntos
 * ou fracionados, sem confundir chunks de transporte com mensagens lógicas.
 */
export function extractCompatecFrames(input: Buffer): { frames: Buffer[]; remainder: Buffer } {
  const frames: Buffer[] = [];
  let offset = 0;

  while (offset < input.length) {
    const packetType = input[offset];
    if (packetType === 0x2a) { // * + 6 caracteres de MAC/IMEI
      if (input.length - offset < 7) break;
      frames.push(input.subarray(offset, offset + 7));
      offset += 7;
      continue;
    }

    if (packetType === 0x23) { // # + 4 caracteres de conta
      if (input.length - offset < 5) break;
      frames.push(input.subarray(offset, offset + 5));
      offset += 5;
      continue;
    }

    if (packetType === 0x40) { // @ Keep Alive
      frames.push(input.subarray(offset, offset + 1));
      offset += 1;
      continue;
    }

    if (packetType === 0x24) { // $ Contact ID + contador + 0xB6
      const terminatorAt = input.indexOf(0xb6, offset + 1);
      if (terminatorAt < 0) break;
      frames.push(input.subarray(offset, terminatorAt + 1));
      offset = terminatorAt + 1;
      continue;
    }

    // Reassume sincronismo no próximo byte conhecido. Esse dado não é ACKado.
    offset += 1;
  }

  return { frames, remainder: input.subarray(offset) };
}

export function parseCompatecFrame(frame: Buffer): CompatecProtocolFrame | undefined {
  const text = frame.toString("latin1");
  if (frame[0] === 0x2a && frame.length === 7) {
    const identifier = text.slice(1).trim().toUpperCase();
    return /^[A-F0-9]{6}$/.test(identifier) ? { kind: "identity", identifier } : undefined;
  }

  if (frame[0] === 0x23 && frame.length === 5) {
    return { kind: "account", account: text.slice(1).trim() };
  }

  if (frame.length === 1 && frame[0] === 0x40) return { kind: "keep_alive" };

  if (frame[0] === 0x24 && frame.length >= 16 && frame[frame.length - 1] === 0xb6) {
    const payload = text.slice(1, -2);
    if (payload.length < 13) return undefined;
    return {
      kind: "event",
      account: payload.slice(0, 4),
      qualifier: payload.slice(4, 5),
      eventCode: payload.slice(5, 8),
      partition: payload.slice(8, 10),
      zoneUser: payload.slice(10, 13),
      packetCounter: text.slice(-2, -1),
      rawData: text,
    };
  }

  return undefined;
}

/**
 * A Compatec retransmite o mesmo evento quando o ACK não chega. O contador
 * circula de A a Z; por isso a chave inclui todo o pacote e expira rapidamente.
 */
export function shouldProcessCompatecEvent(
  recentEvents: Map<string, number>,
  rawFrame: string,
  now = Date.now(),
  retryWindowMs = 120_000,
) {
  for (const [key, receivedAt] of Array.from(recentEvents.entries())) {
    if (now - receivedAt > retryWindowMs) recentEvents.delete(key);
  }

  const previous = recentEvents.get(rawFrame);
  if (previous !== undefined && now - previous <= retryWindowMs) return false;
  recentEvents.set(rawFrame, now);
  return true;
}
