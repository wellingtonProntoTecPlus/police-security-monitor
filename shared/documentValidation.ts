export type BrazilianDocumentKind = "cpf" | "cnpj";

export function normalizeBrazilianDocument(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value: string) {
  const digits = normalizeBrazilianDocument(value);
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false;
  const calculate = (length: number) => {
    const total = digits.slice(0, length).split("").reduce((sum, digit, index) => sum + Number(digit) * (length + 1 - index), 0);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
}

export function isValidCnpj(value: string) {
  const digits = normalizeBrazilianDocument(value);
  if (digits.length !== 14 || hasRepeatedDigits(digits)) return false;
  const calculate = (length: number) => {
    let factor = length === 12 ? 5 : 6;
    const total = digits.slice(0, length).split("").reduce((sum, digit) => {
      const next = sum + Number(digit) * factor;
      factor = factor === 2 ? 9 : factor - 1;
      return next;
    }, 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(digits[12]) && calculate(13) === Number(digits[13]);
}

export function validateOptionalBrazilianDocument(value: string | null | undefined, expectedKind?: BrazilianDocumentKind) {
  const document = normalizeBrazilianDocument(value);
  if (!document) return { document: null, kind: null, error: null } as const;
  const kind: BrazilianDocumentKind | null = document.length === 11 ? "cpf" : document.length === 14 ? "cnpj" : null;
  if (!kind) return { document, kind: null, error: "Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos" } as const;
  if (expectedKind && kind !== expectedKind) return { document, kind, error: expectedKind === "cpf" ? "Informe um CPF válido" : "Informe um CNPJ válido" } as const;
  const valid = kind === "cpf" ? isValidCpf(document) : isValidCnpj(document);
  return valid
    ? { document, kind, error: null } as const
    : { document, kind, error: kind === "cpf" ? "CPF inválido" : "CNPJ inválido" } as const;
}
