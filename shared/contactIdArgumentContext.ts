export type ContactIdArgumentContext = {
  label: "IP" | "Usuário" | "Zona isolada" | "PGM" | "Argumento";
  value: string;
  description?: string;
};

type ContactIdArgumentInput = {
  eventCode?: string | number | null;
  qualifier?: string | null;
  value?: string | number | null;
};

function normalizedCode(value: ContactIdArgumentInput["eventCode"]) {
  return String(value ?? "").replace(/\D/g, "").padStart(3, "0").slice(-3);
}

function normalizedQualifier(value: ContactIdArgumentInput["qualifier"]) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizedValue(value: ContactIdArgumentInput["value"]) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? String(Number(digits)) : "";
}

/**
 * O argumento Contact ID não é sinônimo de zona. A leitura depende do código
 * e do qualificador e é compartilhada por todos os fabricantes.
 */
export function getContactIdArgumentContext(input: ContactIdArgumentInput): ContactIdArgumentContext {
  const eventCode = normalizedCode(input.eventCode);
  const qualifier = normalizedQualifier(input.qualifier);
  const value = normalizedValue(input.value);
  const suffix = value || "não informado";

  if (eventCode === "361") {
    return {
      label: "IP",
      value: suffix,
      description: qualifier === "E" ? `Falha de Keep Alive IP ${suffix}` : qualifier === "R" ? `Keep Alive restaurado IP ${suffix}` : undefined,
    };
  }
  if (eventCode === "401") {
    return {
      label: "Usuário",
      value: suffix,
      description: qualifier === "R" ? `Armado por Usuário ${suffix}` : qualifier === "E" ? `Desarmado por Usuário ${suffix}` : undefined,
    };
  }
  if (eventCode === "570") {
    return {
      label: "Zona isolada",
      value: suffix,
      description: qualifier === "E" ? `Zona isolada ${suffix}` : qualifier === "R" ? `Restaura Zona Isolada ${suffix}` : undefined,
    };
  }
  if (eventCode === "708") {
    return {
      label: "PGM",
      value: suffix,
      description: qualifier === "E" ? `PGM acionado ${suffix}` : qualifier === "R" ? `PGM desacionado ${suffix}` : undefined,
    };
  }
  if (eventCode === "407") {
    return {
      label: "Usuário",
      value: suffix,
      description: qualifier === "E" ? `Desarmado por aplicativo Usuário ${suffix}` : qualifier === "R" ? `Armado por aplicativo Usuário ${suffix}` : undefined,
    };
  }
  return { label: "Argumento", value: suffix };
}

export function formatContactIdArgument(input: ContactIdArgumentInput) {
  const context = getContactIdArgumentContext(input);
  return `${context.label} ${context.value}`;
}
