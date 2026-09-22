export type QuickFinalizationOption = {
  id?: number;
  title?: string | null;
  description?: string | null;
  isActive?: boolean | number | null;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function getQuickFinalizationOptions<T extends QuickFinalizationOption>(options: T[], searchTerm: string) {
  const normalizedSearch = normalizeText(searchTerm.trim());

  return options
    .filter((option) => option.isActive !== false && option.isActive !== 0)
    .filter((option) => {
      if (!normalizedSearch) return true;
      const searchableText = normalizeText(`${option.title || ""} ${option.description || ""}`);
      return searchableText.includes(normalizedSearch);
    })
    .sort((left, right) => normalizeText(left.title).localeCompare(normalizeText(right.title), "pt-BR", { sensitivity: "base" }));
}
