export type ContactIdAutomationConfig = {
  abreTela?: number | null;
  fechaComRestauracao?: number | null;
};

export type AutomaticEventAction = "report_only" | "try_restoration" | "track_for_restoration" | "queue";

export function getAutomaticEventAction(qualifier: string, codeInfo?: ContactIdAutomationConfig | null): AutomaticEventAction {
  if (codeInfo?.abreTela === 0) return "report_only";
  // Alguns eventos analíticos usam qualifier R como direção oposta (ex.: B-A)
  // e ainda precisam abrir atendimento. A configuração abre_tela tem prioridade.
  if (codeInfo?.abreTela === 1) {
    return codeInfo.fechaComRestauracao === 1 ? "track_for_restoration" : "queue";
  }
  if (qualifier === "R") return "try_restoration";
  return "queue";
}
