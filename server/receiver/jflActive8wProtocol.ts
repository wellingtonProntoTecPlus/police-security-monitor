/**
 * Quadros de infraestrutura da Active 8W v8 observados na porta JFL.
 *
 * Estes quadros apenas confirmam a identificação da central e solicitam seu
 * estado. Não armam, desarmam, isolam zonas nem acionam PGMs.
 */
function xorChecksum(bytes: readonly number[]) {
  return bytes.reduce((checksum, value) => checksum ^ value, 0);
}

export function isJflActive8wV8Connection(frame: Buffer) {
  return frame[0] === 0x7a && frame.length >= 6 && frame[5] === 0x21;
}

/**
 * A Active 8W v8 usa cabeçalho 7A e mantém o contador recebido no byte 3.
 * A confirmação é um quadro JFL 7B de infraestrutura, com sequência local 1,
 * como nas conexões Active que entregam Contact ID em seguida.
 */
export function buildJflActive8wConnectionAcknowledgement(frame: Buffer) {
  if (!isJflActive8wV8Connection(frame)) return undefined;
  const responseWithoutChecksum = [0x7b, 0x07, 0x01, 0x21, 0x01, 0x01];
  return Buffer.from([...responseWithoutChecksum, xorChecksum(responseWithoutChecksum)]);
}

/** Solicitação exclusivamente passiva de status/eventos pendentes da central. */
export function buildJflStatusRequest() {
  const requestWithoutChecksum = [0x7b, 0x05, 0x01, 0x4d];
  return Buffer.from([...requestWithoutChecksum, xorChecksum(requestWithoutChecksum)]);
}
