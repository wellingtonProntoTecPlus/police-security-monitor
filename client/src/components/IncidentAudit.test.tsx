// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IncidentAuditTimeline from "./IncidentAuditTimeline";
import IncidentAuditReport, { parseAuditReportDateTime } from "./IncidentAuditReport";
import { formatIncidentAuditDateTime, incidentAuditActionLabel } from "@shared/incidentAudit";
import { buildRemoteCommandIncidentNotes, buildRemoteCommandRequestNote } from "../../../server/remoteCommandEventCorrelation";

const state = vi.hoisted(() => ({
  trail: { data: { items: [] as any[], nextCursor: null as number | null }, isLoading: false, isFetching: false, error: null as any },
  report: { data: { items: [] as any[], hasMore: false }, isLoading: false, isFetching: false, error: null as any },
  trailInputs: vi.fn(), reportInputs: vi.fn(), refetch: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  incident: {
    auditTrail: { useQuery: (input: any, options: any) => { state.trailInputs(input, options); return { ...state.trail, refetch: state.refetch }; } },
    auditReport: { useQuery: (input: any) => { state.reportInputs(input); return { ...state.report, refetch: state.refetch }; } },
  },
  monitoredClient: { list: { useQuery: () => ({ data: [{ id: 4, name: "Cliente 4", partnerCompanyId: 8 }] }) } },
  partnerCompany: { list: { useQuery: () => ({ data: [{ id: 8, name: "Parceira 8" }] }) } },
} }));
vi.mock("sonner", () => ({ toast: { error: state.toast } }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  state.trail = { data: { items: [], nextCursor: null }, isLoading: false, isFetching: false, error: null };
  state.report = { data: { items: [], hasMore: false }, isLoading: false, isFetching: false, error: null };
});

describe("Auditoria persistente de ocorrências", () => {
  it("não consulta sem ocorrência e informa a consulta posterior no relatório", () => {
    render(<IncidentAuditTimeline />);
    expect(state.trailInputs).toHaveBeenLastCalledWith({ incidentId: 0, beforeId: undefined }, expect.objectContaining({ enabled: false }));
    expect(screen.getByText(/registros permanecem disponíveis/)).toBeTruthy();
  });
  it("mostra operador, horário completo e nota salva em letra normal legível", () => {
    state.trail.data.items = [{ id: 9, incidentId: 91, operatorName: "Amanda", action: "camera_viewed", note: "Abriu Câmera 4", createdAt: new Date("2026-11-14T21:00:01Z") }];
    render(<IncidentAuditTimeline incidentId={91} />);
    expect(screen.getByText(/Amanda · Abriu uma câmera/)).toBeTruthy();
    expect(screen.getByText("Abriu Câmera 4").className).toContain("text-sm");
    expect(screen.getByText(/14\/11\/2026,? 18:00:01/)).toBeTruthy();
    expect(state.trailInputs).toHaveBeenLastCalledWith(expect.objectContaining({ incidentId: 91 }), expect.objectContaining({ refetchInterval: 5000 }));
  });
  it("mostra duas linhas operacionais para um comando e não despeja o bloco técnico", () => {
    const rawCommandNotes = [
      buildRemoteCommandRequestNote({ commandId: 109, commandType: "arm", operatorName: "Wellington", reason: "Teste autorizado" }),
      buildRemoteCommandIncidentNotes({ commandId: 109, commandType: "arm", commandLabel: "Arme remoto", operatorName: "Wellington", reason: "Teste autorizado", response: "MB=KA4" }),
    ].join("\n");
    state.trail.data.items = [{ id: 10, incidentId: 91, operatorName: "Amanda", action: "finalized", note: rawCommandNotes, createdAt: new Date("2026-11-14T21:00:01Z") }];
    render(<IncidentAuditTimeline incidentId={91} />);
    const summary = screen.getByText(/Comando: Arme/).textContent || "";
    expect(summary.split("\n")).toHaveLength(2);
    expect(summary).toContain("Motivo: Teste autorizado");
    expect(summary).toContain("Resposta recebida; conferir estado final");
    expect(summary).not.toMatch(/COMANDO REMOTO|KA4|AK4|Auditoria do comando|Operador:/);
  });
  it("distingue erro de ausência e oferece retry", async () => {
    state.trail.error = new Error("Rede indisponível");
    render(<IncidentAuditTimeline incidentId={91} />);
    expect(screen.getByRole("alert").textContent).toContain("não significa que o histórico está vazio");
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });
  it("pagina por cursor sem descartar registros antigos e reinicia ao mudar a ocorrência", async () => {
    state.trail.data.nextCursor = 20;
    const view = render(<IncidentAuditTimeline incidentId={91} />);
    await userEvent.click(screen.getByRole("button", { name: "Ver registros anteriores" }));
    expect(state.trailInputs).toHaveBeenLastCalledWith({ incidentId: 91, beforeId: 20 }, expect.objectContaining({ refetchInterval: false }));
    view.rerender(<IncidentAuditTimeline incidentId={92} />);
    await waitFor(() => expect(state.trailInputs).toHaveBeenLastCalledWith({ incidentId: 92, beforeId: undefined }, expect.anything()));
  });
  it("consulta logs com início/fim convertidos explicitamente de Brasília a instantes UTC", async () => {
    render(<IncidentAuditReport />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Data/hora inicial"), "2026-11-14T08:00");
    await user.type(screen.getByLabelText("Data/hora final"), "2026-11-14T09:30");
    await user.click(screen.getByRole("button", { name: "Consultar logs" }));
    expect(state.reportInputs).toHaveBeenLastCalledWith(expect.objectContaining({ from: new Date("2026-11-14T11:00:00Z"), to: new Date("2026-11-14T12:30:59.999Z"), offset: 0 }));
  });
  it("limita cada página, pede a próxima e mostra log de ocorrência finalizada", async () => {
    state.report.data = { items: [{ id: 99, incidentId: 91, account: "0041", clientName: "Cliente 4", operatorName: "Amanda", action: "finalized", note: "Sem anormalidades", createdAt: new Date("2026-11-14T18:00:00Z") }], hasMore: true };
    render(<IncidentAuditReport />);
    expect(screen.getByText("Finalizou a ocorrência")).toBeTruthy();
    expect(screen.getByText("Sem anormalidades")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(state.reportInputs).toHaveBeenLastCalledWith({ offset: 100 });
  });
  it("mantém nomes de ações precisos sem afirmar ligação completada ou vídeo assistido", () => {
    expect(incidentAuditActionLabel({ action: "contact_call_clicked" })).toBe("Acionou a opção de ligação");
    expect(incidentAuditActionLabel({ action: "status_changed", statusAfter: "dispatched" })).toContain("Encaminhou");
    expect(incidentAuditActionLabel({ action: "tactical_status_updated" })).toContain("informado");
    expect(incidentAuditActionLabel({ action: "remote_command_reconciled" })).toContain("Conferiu manualmente");
    expect(parseAuditReportDateTime("")).toBeUndefined();
    expect(formatIncidentAuditDateTime("inválido")).toBe("Horário não informado");
  });
});
