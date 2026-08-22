export type ReportExportRow = {
  finalizedAt?: Date | string | null;
  account?: string | null;
  clientName?: string | null;
  qualifier?: string | null;
  eventCode?: string | null;
  description?: string | null;
  observations?: string | null;
  attendingTimeMs?: number | null;
  operatorName?: string | null;
};

function csvField(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function formatReportDuration(milliseconds?: number | null) {
  if (!milliseconds) return "-";
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
}

export function formatReportDate(value?: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

export function buildOccurrenceReportCsv(rows: ReportExportRow[]) {
  const header = ["Data/Hora", "Conta", "Cliente", "Evento", "Descrição", "Finalização", "Tempo", "Operador"];
  const body = rows.map((row) => [
    formatReportDate(row.finalizedAt),
    row.account || "",
    row.clientName || "Conta do Sistema",
    `${row.qualifier || ""}${row.eventCode || ""}`,
    row.description || "",
    row.observations || "",
    formatReportDuration(row.attendingTimeMs),
    row.operatorName || "",
  ]);

  return "\uFEFF" + [header, ...body].map((line) => line.map(csvField).join(";")).join("\n");
}
