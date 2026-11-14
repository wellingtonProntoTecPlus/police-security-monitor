// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecentClientEventsPanel from "./RecentClientEventsPanel";

const queryMock = vi.hoisted(() => ({
  result: { data: undefined as any, isLoading: true, isFetching: false, error: null as Error | null, refetch: vi.fn() },
  useQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { incident: { recentClientEvents: { useQuery: (...args: any[]) => queryMock.useQuery(...args) } } },
}));

afterEach(cleanup);
beforeEach(() => {
  queryMock.result = { data: undefined, isLoading: true, isFetching: false, error: null, refetch: vi.fn() };
  queryMock.useQuery.mockReset().mockImplementation(() => queryMock.result);
});

const event = {
  id: 102,
  alarmSystemId: 30,
  account: "0041",
  brand: "RADIOENGE",
  systemModel: "CR32",
  qualifier: "R",
  eventCode: "130",
  partition: "01",
  zoneUser: "003",
  description: "Restauração da zona 3",
  priority: "medium",
  receivedAt: new Date("2026-11-14T12:00:00.000Z"),
};

describe("RecentClientEventsPanel", () => {
  it("loads only for the selected open incident and shows its recent event read-only", () => {
    queryMock.result = { data: { incidentEventId: 102, events: [event] }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
    render(<RecentClientEventsPanel incidentId={77} currentEventId={102} />);
    expect(queryMock.useQuery).toHaveBeenCalledWith({ incidentId: 77 }, expect.objectContaining({ enabled: true, refetchInterval: 15_000 }));
    expect(screen.getByText("Restauração da zona 3")).toBeTruthy();
    expect(screen.getByText("Origem desta ocorrência")).toBeTruthy();
    expect(screen.getByText("Restauração da zona 3").closest("li")?.textContent).toContain("Conta 0041 · RADIOENGE CR32");
    expect(screen.getByText(/Consulta somente leitura/)).toBeTruthy();
    expect(screen.queryByText(/DADO_FICTICIO/)).toBeNull();
  });

  it("does not call every Contact ID qualifier R a restoration", () => {
    queryMock.result = { data: { incidentEventId: 102, events: [{ ...event, qualifier: "R", eventCode: "401", description: "Armado por aplicativo" }] }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
    render(<RecentClientEventsPanel incidentId={77} />);
    expect(screen.getByText("R401")).toBeTruthy();
    expect(screen.getByText("Armado por aplicativo")).toBeTruthy();
    expect(screen.queryByText("Restauração", { exact: true })).toBeNull();
  });

  it("does not present a query error as an empty client history and supports retry", () => {
    const refetch = vi.fn();
    queryMock.result = { data: undefined, isLoading: false, isFetching: false, error: new Error("Falha de rede"), refetch };
    render(<RecentClientEventsPanel incidentId={77} />);
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível consultar");
    expect(screen.queryByText(/Nenhum evento recebido/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct empty state and can refresh manually", () => {
    const refetch = vi.fn();
    queryMock.result = { data: { incidentEventId: 1, events: [] }, isLoading: false, isFetching: false, error: null, refetch };
    render(<RecentClientEventsPanel incidentId={77} />);
    expect(screen.getByText(/Nenhum evento recebido/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar eventos recentes" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
