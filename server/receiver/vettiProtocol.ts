export type VettiLoginIdentity = {
  account: string;
  macSuffix: string;
};

function hex2(value: number) {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

/** O quadro de login C0 contém Conta e os seis últimos caracteres do MAC. */
export function parseVettiLoginIdentity(data: Buffer): VettiLoginIdentity | undefined {
  if (!Buffer.isBuffer(data) || data.length < 9 || data[2] !== 0xC0) return undefined;

  return {
    account: hex2(data[4]) + hex2(data[5]),
    macSuffix: data.subarray(6, 9).toString("hex").toUpperCase(),
  };
}

/** Nos quadros C1 os bytes 4 e 5 não representam a conta; use a conta do login C0. */
export function resolveVettiEventAccount(data: Buffer, loginIdentity?: VettiLoginIdentity) {
  if (loginIdentity?.account) return loginIdentity.account;
  return hex2(data[4]) + hex2(data[5]);
}
