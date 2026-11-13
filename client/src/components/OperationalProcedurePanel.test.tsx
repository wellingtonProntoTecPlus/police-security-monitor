// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OperationalProcedurePanel from "./OperationalProcedurePanel";
afterEach(cleanup);
const base = { clientIdentified: true, procedures: [], onRetry: vi.fn() };
describe("operator protocol instructions", () => {
  it("shows saved instructions including line breaks before an operator starts writing notes", () => {
    render(<OperationalProcedurePanel {...base} eventType="alarm" hasSpecificProcedure procedures={[{ id: 1, title: "Disparo na loja", description: "Primeiro passo\nSegundo passo", procedureType: "alarm" }]} />);
    expect(screen.getByText("Disparo na loja")).toBeTruthy();
    expect(screen.getByText(/Primeiro passo/).textContent).toContain("\nSegundo passo");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("always warns when the specific protocol is missing, even with a general instruction present", () => {
    render(<OperationalProcedurePanel {...base} eventType="system_problem" hasSpecificProcedure={false} procedures={[{ id: 2, title: "Orientação geral", description: "Seguir responsável", procedureType: "general" }]} />);
    expect(screen.getByRole("alert").textContent).toContain("Nenhum protocolo de problemas");
    expect(screen.getByRole("alert").textContent).toContain("anotações do atendimento não substituem o protocolo");
    expect(screen.getByText("Orientação geral")).toBeTruthy();
  });
  it("shows a query failure distinctly from an absent protocol and allows retry", () => {
    const retry = vi.fn();
    render(<OperationalProcedurePanel {...base} error={new Error("offline")} onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível consultar");
    expect(screen.queryByText(/Nenhum protocolo de/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("does not declare a protocol absent while loading", () => {
    render(<OperationalProcedurePanel {...base} isLoading />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not show another customer's instructions when no client is identified", () => {
    render(<OperationalProcedurePanel {...base} clientIdentified={false} procedures={[{ id: 1, title: "Never display", description: "private" }]} />);
    expect(screen.getByRole("alert").textContent).toContain("Cliente não identificado");
    expect(screen.queryByText("Never display")).toBeNull();
  });
  it("opens complete instructions using Ver tudo without any physical command", () => {
    const open = vi.fn();
    render(<OperationalProcedurePanel {...base} onViewAll={open} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver tudo" }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
