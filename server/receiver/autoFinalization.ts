export type ContactIdAutomationConfig = {
  abreTela?: number | null;
  fechaComRestauracao?: number | null;
};

export type AutomaticEventAction = "report_only" | "try_restoration" | "track_for_restoration" | "queue";

export function getAutomaticEventAction(qualifier: string, codeInfo?: ContactIdAutomationConfig | null): AutomaticEventAction {
  if (codeInfo?.abreTela === 0) return "report_only";
  if (qualifier === "R") return "try_restoration";
  if (codeInfo?.fechaComRestauracao === 1) return "track_for_restoration";
  return "queue";
}
