export type ContactIdAutomationConfig = {
  abreTela?: number | null;
  fechaComRestauracao?: number | null;
};

export type AutomaticEventAction = "report_only" | "try_restoration" | "track_for_restoration" | "queue";

export function getAutomaticEventAction(qualifier: string, codeInfo?: ContactIdAutomationConfig | null): AutomaticEventAction {
  // Alguns eventos analíticos usam qualifier R como direção oposta (ex.: B-A)
  // e ainda precisam abrir atendimento quando não são restaurações pareadas.
  // Um evento explicitamente pareado a uma restauração precisa ser persistido
  // para poder ser encerrado, mesmo quando não deve aparecer imediatamente.
  if (qualifier === "E" && codeInfo?.fechaComRestauracao === 1) return "track_for_restoration";
  if (codeInfo?.abreTela === 1) {
    return codeInfo.fechaComRestauracao === 1 ? "track_for_restoration" : "queue";
  }
  if (qualifier === "R") return "try_restoration";
  if (codeInfo?.abreTela === 0) return "report_only";
  return "queue";
}
