export type ClientWithAccountList<T extends { id: number }> = T & {
  accounts: string[];
  primaryAccount: string | null;
};

export function enrichClientsWithAccounts<T extends { id: number }>(
  clientRows: T[],
  systems: Array<{ clientId: number; account: string | null }>,
): ClientWithAccountList<T>[] {
  const accountsByClient = new Map<number, string[]>();
  for (const system of systems) {
    const account = system.account?.trim();
    if (!account) continue;
    const accounts = accountsByClient.get(system.clientId) ?? [];
    if (!accounts.includes(account)) accounts.push(account);
    accountsByClient.set(system.clientId, accounts);
  }

  return clientRows
    .map((client) => {
      const accounts = [...(accountsByClient.get(client.id) ?? [])]
        .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }));
      return { ...client, accounts, primaryAccount: accounts[0] ?? null };
    })
    .sort((a, b) => {
      if (!a.primaryAccount && !b.primaryAccount) return 0;
      if (!a.primaryAccount) return 1;
      if (!b.primaryAccount) return -1;
      return a.primaryAccount.localeCompare(b.primaryAccount, "pt-BR", { numeric: true, sensitivity: "base" });
    });
}
