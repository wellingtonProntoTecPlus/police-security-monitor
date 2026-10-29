type OperationalSearchEntry = {
  account?: string | null;
  accounts?: string[] | null;
  clientName?: string | null;
  clientFantasyName?: string | null;
  name?: string | null;
  fantasyName?: string | null;
  brand?: string | null;
  model?: string | null;
};

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/** Busca progressiva, aceitando parte da conta, nome, sobrenome, razão social ou fantasia. */
export function matchesOperationalStatusSearch(item: OperationalSearchEntry, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  const accounts = item.accounts || [];
  const searchable = [
    item.account,
    ...accounts,
    item.clientName,
    item.clientFantasyName,
    item.name,
    item.fantasyName,
    item.brand,
    item.model,
  ].map(normalize).join(" ");
  return searchable.includes(normalizedQuery);
}
