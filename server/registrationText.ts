const LOWERCASE_CONNECTORS = new Set([
  "a", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "para", "por",
]);

const PRESERVED_ACRONYMS = new Set([
  "CPF", "CNPJ", "EPP", "GPRS", "IMEI", "IP", "LTDA", "ME", "MG", "RJ", "RS", "RTSP", "SP", "UF", "URL",
]);

function formatWord(word: string, isFirstWord: boolean) {
  if (!word || /^\d+$/.test(word)) return word;
  const upper = word.toLocaleUpperCase("pt-BR");
  if (PRESERVED_ACRONYMS.has(upper)) return upper;
  if (!isFirstWord && LOWERCASE_CONNECTORS.has(word.toLocaleLowerCase("pt-BR"))) return word.toLocaleLowerCase("pt-BR");

  return word
    .split(/([-'’])/)
    .map((piece) => {
      if (!piece || /[-'’]/.test(piece)) return piece;
      const lower = piece.toLocaleLowerCase("pt-BR");
      return `${lower.charAt(0).toLocaleUpperCase("pt-BR")}${lower.slice(1)}`;
    })
    .join("");
}

/**
 * Padroniza campos cadastrais de nome e endereço sem tocar em senhas,
 * identificadores técnicos, telefones, e-mails ou observações livres.
 */
export function formatRegistrationText(value: string | null | undefined) {
  if (value === null || value === undefined) return value;
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return compact;

  let wordIndex = 0;
  return compact.replace(/[A-Za-zÀ-ÿ0-9'’_-]+/g, (word) => {
    const formatted = formatWord(word, wordIndex === 0);
    wordIndex += 1;
    return formatted;
  });
}

export function formatRegistrationFields<T extends Record<string, unknown>>(data: T, fields: readonly string[]): T {
  const formatted = { ...data };
  const mutableFormatted = formatted as Record<string, unknown>;
  for (const field of fields) {
    const value = formatted[field];
    if (typeof value === "string") mutableFormatted[field] = formatRegistrationText(value);
  }
  return formatted;
}

const FIELDS_BY_REGISTRATION_KIND = {
  managingCompany: ["name", "address", "city"],
  partnerCompany: ["name", "address", "city"],
  tacticalMobile: ["name", "vehicle"],
  client: ["name", "fantasyName", "address", "complement", "neighborhood", "city"],
  clientContact: ["name", "role"],
  alarmSystem: ["model"],
  zone: ["name"],
  panelUser: ["name"],
  camera: ["name", "location"],
  pgm: ["name"],
  schedule: ["name"],
  procedure: ["title"],
  holiday: ["name"],
  systemUser: ["name"],
  finalization: ["title"],
} as const;

export type RegistrationKind = keyof typeof FIELDS_BY_REGISTRATION_KIND;

/** Contrato único usado pelos CRUDs antes de cada gravação cadastral. */
export function normalizeRegistrationPayload<T extends Record<string, unknown>>(kind: RegistrationKind, data: T) {
  return formatRegistrationFields(data, FIELDS_BY_REGISTRATION_KIND[kind]);
}
