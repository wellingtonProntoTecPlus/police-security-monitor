export type SystemAccountResolution = {
  account: string;
  receivedAccount: string;
  isSystemAccount: boolean;
};

export function resolveSystemAccount(receivedAccount: string | null | undefined, systemFound: boolean): SystemAccountResolution {
  const normalized = (receivedAccount || "").trim();
  if (systemFound && normalized) {
    return { account: normalized, receivedAccount: normalized, isSystemAccount: false };
  }
  return { account: "0000", receivedAccount: normalized, isSystemAccount: true };
}
